import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

const totalAmount = (request: any) => {
  if (request.total_amount != null) return Number(request.total_amount)
  if (request.amount != null) return Number(request.amount)
  if (request.payment_request_lines) {
    return request.payment_request_lines.reduce(
      (sum: number, line: any) => sum + Number(line.amount ?? line.amount_with_tax ?? 0),
      0
    )
  }
  return 0
}

const partnerName = (request: any) =>
  request.partner_name ??
  request.partner?.name ??
  request.payment_request_lines?.[0]?.partner_name ??
  "不明"

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 })
    }

    const accessToken = req.cookies.get("freee_access_token")?.value
    const companyId = req.cookies.get("freee_company_id")?.value

    if (!accessToken || !companyId) {
      return NextResponse.json({ error: "freee未連携" }, { status: 401 })
    }

    const { selectedIds }: { selectedIds: string[] } = await req.json()
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return NextResponse.json({ error: "取り込む被請求書を選択してください" }, { status: 400 })
    }

    const params = new URLSearchParams({ company_id: companyId, limit: "100", offset: "0" })
    const freeeRes = await fetch(`https://api.freee.co.jp/api/1/payment_requests?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!freeeRes.ok) {
      const detail = await freeeRes.text().catch(() => "")
      return NextResponse.json({ error: "freee支払依頼APIエラー", detail }, { status: 502 })
    }

    const body = await freeeRes.json()
    const requests = body.payment_requests ?? body
    if (!Array.isArray(requests)) {
      return NextResponse.json({ error: "データ形式が不正です" }, { status: 502 })
    }

    const targets = requests.filter((request: any) => selectedIds.includes(String(request.id)))
    const sb = getSb()
    const ownerCompanyId = (session.user as any).companyId
    let created = 0
    let skipped = 0

    for (const request of targets) {
      const sourceId = String(request.id)
      const { data: exists, error: existsError } = await sb.from("ReceivedInvoice")
        .select("id")
        .eq("source", "freee")
        .eq("sourceId", sourceId)
        .eq("ownerCompanyId", ownerCompanyId)
        .limit(1)
        .maybeSingle()

      if (existsError) throw new Error(existsError.message)
      if (exists) {
        skipped++
        continue
      }

      const now = new Date().toISOString()
      const amount = totalAmount(request)
      const issueDate = new Date(
        request.issue_date ?? request.application_date ?? request.created_at ?? Date.now()
      ).toISOString()
      const dueDate = new Date(
        request.payment_date ?? request.due_date ?? request.approval_deadline ?? Date.now()
      ).toISOString()
      const status = ["paid", "settled"].includes(String(request.status)) ? "PAID" : "UNPAID"

      const { error: createError } = await sb.from("ReceivedInvoice").insert({
        id: crypto.randomUUID(),
        invoiceNumber: request.invoice_number ?? request.form_number ?? `FREEE-PR-${sourceId}`,
        vendorName: partnerName(request),
        subject: request.title ?? request.description ?? request.payment_request_lines?.[0]?.description ?? "支払依頼",
        issueDate,
        dueDate,
        amount,
        status,
        paidAt: status === "PAID" ? dueDate : null,
        ownerCompanyId,
        notes: request.memo ?? null,
        source: "freee",
        sourceId,
        createdAt: now,
        updatedAt: now,
      })

      if (createError) throw new Error(createError.message)
      created++
    }

    return NextResponse.json({ ok: true, created, skipped, total: targets.length })
  } catch (e: any) {
    console.error("[freee received sync ERROR]", e?.message ?? e)
    return NextResponse.json(
      { error: e?.message ?? "freeeからの被請求書取り込みに失敗しました" },
      { status: 500 }
    )
  }
}
