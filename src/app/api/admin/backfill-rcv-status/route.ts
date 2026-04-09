/**
 * 一時的なバックフィル・診断エンドポイント
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

  // 消込済み・入金確認済み Invoice を取得
  const { data: invoices } = await sb
    .from("Invoice")
    .select("id, companyId, amount, status")
    .in("status", ["CLEARED", "PAYMENT_CONFIRMED"])

  // UNPAID の ReceivedInvoice を全件取得（診断用）
  const { data: rcvAll } = await sb
    .from("ReceivedInvoice")
    .select("id, invoiceId, ownerCompanyId, amount, status")
    .eq("status", "UNPAID")

  // invoiceId が null のみ
  const { data: rcvUnlinked } = await sb
    .from("ReceivedInvoice")
    .select("id, invoiceId, ownerCompanyId, amount, status")
    .eq("status", "UNPAID")
    .is("invoiceId", null)

  return NextResponse.json({
    clearedInvoices: invoices,
    unpaidRcv_all: rcvAll,
    unpaidRcv_unlinked: rcvUnlinked,
  })
}
