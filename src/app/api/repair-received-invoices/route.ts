/**
 * 補修エンドポイント: 既存の Invoice に対応する ReceivedInvoice が
 * 未作成のものを一括作成する。
 * 使用後は削除して構わない。
 */
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sb = getSb()

    // 発行者と受取先が異なるすべての Invoice を取得
    const { data: invoices, error: e1 } = await sb.from("Invoice")
      .select("id, invoiceNumber, companyId, issuerCompanyId, subject, issueDate, dueDate, amount, notes")
      .not("issuerCompanyId", "is", null)
      .neq("issuerCompanyId", "companyId")  // PostgREST では列同士の比較は不可なので後で JS でフィルタ

    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

    // 発行者と受取先が同一でないものに絞り込む
    const targets = (invoices ?? []).filter(
      (inv: any) => inv.issuerCompanyId && inv.issuerCompanyId !== inv.companyId
    )

    // 既存の ReceivedInvoice（invoiceId が設定されているもの）を取得
    const { data: existingRcv, error: e2 } = await sb.from("ReceivedInvoice")
      .select("invoiceId")
      .not("invoiceId", "is", null)

    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    const existingInvoiceIds = new Set((existingRcv ?? []).map((r: any) => r.invoiceId))

    // 未作成のものだけ対象にする
    const missing = targets.filter((inv: any) => !existingInvoiceIds.has(inv.id))

    if (missing.length === 0) {
      return NextResponse.json({ message: "No missing ReceivedInvoices found.", created: 0 })
    }

    // 発行元の会社名をまとめて取得
    const issuerIds = [...new Set(missing.map((inv: any) => inv.issuerCompanyId))]
    const { data: companies } = await sb.from("Company").select("id, name").in("id", issuerIds)
    const companyMap: Record<string, string> = {}
    for (const c of companies ?? []) companyMap[c.id] = c.name

    // ReceivedInvoice を一括作成
    const now = new Date().toISOString()
    const rows = missing.map((inv: any) => ({
      id:             crypto.randomUUID(),
      invoiceId:      inv.id,
      invoiceNumber:  inv.invoiceNumber,
      vendorName:     companyMap[inv.issuerCompanyId] ?? "",
      subject:        inv.subject,
      issueDate:      inv.issueDate,
      dueDate:        inv.dueDate,
      amount:         inv.amount,
      status:         "UNPAID",
      ownerCompanyId: inv.companyId,
      notes:          inv.notes ?? null,
      createdAt:      now,
      updatedAt:      now,
    }))

    const { error: e3 } = await sb.from("ReceivedInvoice").insert(rows)
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 })

    return NextResponse.json({
      message: `Created ${rows.length} missing ReceivedInvoice(s).`,
      created: rows.length,
      invoiceNumbers: rows.map(r => r.invoiceNumber),
    })
  } catch (e: any) {
    console.error("[repair-received-invoices]", e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
