import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { fetchFreeeReceivedCandidates } from "@/lib/freee/received-invoices"

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
      return NextResponse.json({ error: "取り込む被請求書を選択してください" }, { status: 400 })
    }

    const candidates = await fetchFreeeReceivedCandidates(accessToken, companyId)
    const targets = candidates.filter((item) => selectedIds.includes(item.freeeId))
    const sb = getSb()
    const ownerCompanyId = (session.user as any).companyId
    let created = 0
    let skipped = 0

    for (const item of targets) {
      const { data: exists, error: existsError } = await sb.from("ReceivedInvoice")
        .select("id")
        .eq("source", "freee")
        .eq("sourceId", item.sourceId)
        .eq("ownerCompanyId", ownerCompanyId)
        .limit(1)
        .maybeSingle()

      if (existsError) throw new Error(existsError.message)
      if (exists) {
        skipped++
        continue
      }

      const now = new Date().toISOString()
      const issueDate = new Date(item.invoiceDate ?? Date.now()).toISOString()
      const dueDate = new Date(item.dueDate ?? item.invoiceDate ?? Date.now()).toISOString()
      const status = ["paid", "settled"].includes(String(item.status)) ? "PAID" : "UNPAID"

      const { error: createError } = await sb.from("ReceivedInvoice").insert({
        id: crypto.randomUUID(),
        invoiceNumber: item.invoiceNumber,
        vendorName: item.partnerName,
        subject: item.title,
        issueDate,
        dueDate,
        amount: Number(item.totalAmount ?? 0),
        status,
        paidAt: status === "PAID" ? dueDate : null,
        ownerCompanyId,
        notes: item.notes,
        source: "freee",
        sourceId: item.sourceId,
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
