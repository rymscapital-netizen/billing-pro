/**
 * 一時的なバックフィルエンドポイント
 * 消込済み・入金確認済み Invoice に紐づく ReceivedInvoice を PAID に更新する
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

  // 消込済み・入金確認済み Invoice を取得（paymentDate も含む）
  const { data: invoices, error: e1 } = await sb
    .from("Invoice")
    .select("id, status, InvoicePayment(paymentDate, clearedAt)")
    .in("status", ["CLEARED", "PAYMENT_CONFIRMED"])

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })

  let updated = 0
  const errors: string[] = []

  for (const inv of invoices ?? []) {
    const payment = Array.isArray(inv.InvoicePayment)
      ? inv.InvoicePayment[0]
      : inv.InvoicePayment

    // 支払日: 消込日 → 入金確認日 → 今日 の優先順
    const paidAt =
      payment?.clearedAt ??
      payment?.paymentDate ??
      new Date().toISOString()

    const { error: e2, count } = await sb
      .from("ReceivedInvoice")
      .update({
        status:    "PAID",
        paidAt:    new Date(paidAt).toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .eq("invoiceId", inv.id)
      .eq("status", "UNPAID")

    if (e2) {
      errors.push(`invoiceId=${inv.id}: ${e2.message}`)
    } else {
      updated += count ?? 0
    }
  }

  return NextResponse.json({
    message: `バックフィル完了: ${updated} 件の ReceivedInvoice を PAID に更新しました`,
    invoicesChecked: (invoices ?? []).length,
    updated,
    errors,
  })
}
