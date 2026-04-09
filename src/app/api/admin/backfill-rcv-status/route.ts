/**
 * 一時的なバックフィルエンドポイント
 * 消込済み・入金確認済み Invoice に対応する ReceivedInvoice を PAID に更新する
 * invoiceId 紐づけがない場合は companyId + amount でマッチング
 * 実行後は削除してください
 */
import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST() {
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )

  // ① invoiceId で紐づいているケース（既存ロジック）
  const { data: linkedInvoices } = await sb
    .from("Invoice")
    .select("id, companyId, amount, InvoicePayment(paymentDate, clearedAt)")
    .in("status", ["CLEARED", "PAYMENT_CONFIRMED"])

  let updatedByLink = 0
  const linkedIds: string[] = []

  for (const inv of linkedInvoices ?? []) {
    const payment = Array.isArray(inv.InvoicePayment)
      ? inv.InvoicePayment[0]
      : inv.InvoicePayment
    const paidAt = payment?.clearedAt ?? payment?.paymentDate ?? new Date().toISOString()

    const { data: rows } = await sb
      .from("ReceivedInvoice")
      .update({
        status:    "PAID",
        paidAt:    new Date(paidAt).toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq("invoiceId", inv.id)
      .eq("status", "UNPAID")
      .select("id")

    if (rows?.length) {
      updatedByLink += rows.length
      linkedIds.push(...rows.map((r: any) => r.id))
    }
  }

  // ② invoiceId 未設定のケース：ownerCompanyId（= Invoice.companyId）+ amount で一致
  let updatedByMatch = 0

  for (const inv of linkedInvoices ?? []) {
    const payment = Array.isArray(inv.InvoicePayment)
      ? inv.InvoicePayment[0]
      : inv.InvoicePayment
    const paidAt = payment?.clearedAt ?? payment?.paymentDate ?? new Date().toISOString()

    // ownerCompanyId が Invoice の受領先（companyId）と一致し、
    // 金額が一致し、invoiceId が null（未紐づけ）の UNPAID レコードを更新
    const { data: rows } = await sb
      .from("ReceivedInvoice")
      .update({
        status:    "PAID",
        paidAt:    new Date(paidAt).toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq("ownerCompanyId", inv.companyId)
      .eq("amount", inv.amount)
      .eq("status", "UNPAID")
      .is("invoiceId", null)
      .select("id")

    if (rows?.length) {
      updatedByMatch += rows.length
    }
  }

  const total = updatedByLink + updatedByMatch

  return NextResponse.json({
    message:        `バックフィル完了: 合計 ${total} 件を PAID に更新しました`,
    invoicesChecked: (linkedInvoices ?? []).length,
    updatedByInvoiceId: updatedByLink,
    updatedByAmountMatch: updatedByMatch,
    total,
  })
}
