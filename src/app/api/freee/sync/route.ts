import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

const FREEE_STATUS_MAP: Record<string, string> = {
  settled: "CLEARED",
  unsettled: "PENDING",
  canceled: "DRAFT",
}

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

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
      return NextResponse.json({ error: "取り込む請求書を選択してください" }, { status: 400 })
    }

    const params = new URLSearchParams({ company_id: companyId, limit: "100", offset: "0" })
    const freeeRes = await fetch(`https://api.freee.co.jp/iv/invoices?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!freeeRes.ok) {
      const detail = await freeeRes.text().catch(() => "")
      return NextResponse.json({ error: "freee APIエラー", detail }, { status: 502 })
    }

    const body = await freeeRes.json()
    const freeeInvoices = body.invoices ?? body
    if (!Array.isArray(freeeInvoices)) {
      return NextResponse.json({ error: "データ形式が不正です" }, { status: 502 })
    }

    const targets = freeeInvoices.filter((fi: any) => selectedIds.includes(String(fi.id)))
    const sb = getSb()
    const issuerCompanyId = (session.user as any).companyId

    let created = 0
    let skipped = 0

    for (const fi of targets) {
      const invoiceNumber = fi.invoice_number || `FREEE-${fi.id}`

      const { data: exists, error: existsError } = await sb.from("Invoice")
        .select("id")
        .eq("invoiceNumber", invoiceNumber)
        .limit(1)
        .maybeSingle()

      if (existsError) throw new Error(existsError.message)
      if (exists) {
        skipped++
        continue
      }

      const partnerName: string = fi.partner_name || "不明"
      const { data: companyRows, error: companyFindError } = await sb.from("Company")
        .select("id")
        .eq("name", partnerName)
        .eq("type", "CLIENT")
        .limit(1)

      if (companyFindError) throw new Error(companyFindError.message)

      let targetCompanyId = companyRows?.[0]?.id
      if (!targetCompanyId) {
        targetCompanyId = crypto.randomUUID()
        const now = new Date().toISOString()
        const { error: companyCreateError } = await sb.from("Company").insert({
          id: targetCompanyId,
          name: partnerName,
          type: "CLIENT",
          isActive: true,
          createdByCompanyId: issuerCompanyId,
          createdAt: now,
          updatedAt: now,
        })

        if (companyCreateError) throw new Error(companyCreateError.message)
      }

      const amount = fi.total_amount ?? 0
      const tax = fi.amount_tax ?? 0
      const subtotal = amount - tax
      const status = FREEE_STATUS_MAP[fi.payment_status] ?? "ISSUED"
      const issueDate = new Date(fi.billing_date || Date.now()).toISOString()
      const dueDate = new Date(fi.payment_date || Date.now()).toISOString()
      const invoiceId = crypto.randomUUID()
      const now = new Date().toISOString()

      const { error: invoiceCreateError } = await sb.from("Invoice").insert({
        id: invoiceId,
        invoiceNumber,
        companyId: targetCompanyId,
        issuerCompanyId,
        subject: fi.subject || "タイトルなし",
        issueDate,
        dueDate,
        subtotal,
        tax,
        amount,
        status,
        source: "freee",
        sourceId: String(fi.id),
        createdAt: now,
        updatedAt: now,
      })

      if (invoiceCreateError) throw new Error(invoiceCreateError.message)

      const { error: paymentCreateError } = await sb.from("InvoicePayment").insert({
        id: crypto.randomUUID(),
        invoiceId,
        paymentStatus: status === "CLEARED" ? "CONFIRMED" : "UNPAID",
        clearStatus: status === "CLEARED" ? "CLEARED" : "UNCLEARED",
        createdAt: now,
        updatedAt: now,
      })

      if (paymentCreateError) throw new Error(paymentCreateError.message)
      created++
    }

    return NextResponse.json({ ok: true, created, skipped, total: targets.length })
  } catch (e: any) {
    console.error("[freee sync ERROR]", e?.message ?? e)
    return NextResponse.json(
      { error: e?.message ?? "freeeからの取り込みに失敗しました" },
      { status: 500 }
    )
  }
}
