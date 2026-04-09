/**
 * 診断エンドポイント: UNPAID ReceivedInvoice が参照する Invoice のステータス確認
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

  // UNPAID の ReceivedInvoice を全件取得
  const { data: rcvRows } = await sb
    .from("ReceivedInvoice")
    .select("id, invoiceId, amount, status")
    .eq("status", "UNPAID")

  // 参照先 Invoice のステータスを確認
  const invoiceIds = (rcvRows ?? [])
    .map((r: any) => r.invoiceId)
    .filter(Boolean)

  const { data: invoices } = await sb
    .from("Invoice")
    .select("id, status, amount")
    .in("id", invoiceIds)

  const statusMap = Object.fromEntries(
    (invoices ?? []).map((inv: any) => [inv.id, { status: inv.status, amount: inv.amount }])
  )

  const result = (rcvRows ?? []).map((r: any) => ({
    rcvId:       r.id,
    rcvAmount:   r.amount,
    invoiceId:   r.invoiceId,
    invoiceStatus: statusMap[r.invoiceId]?.status ?? "NOT_FOUND",
    invoiceAmount: statusMap[r.invoiceId]?.amount ?? null,
  }))

  return NextResponse.json({ result })
}
