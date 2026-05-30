import { auth } from "@/lib/auth"
import { taxExcludedFromIncluded } from "@/lib/commission"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

async function syncProfit(sb: ReturnType<typeof getSb>, invoiceId: string) {
  const [{ data: receivedRows }, { data: expenseRows }, { data: profit }] = await Promise.all([
    sb.from("ReceivedInvoice").select("amount").eq("invoiceId", invoiceId),
    sb.from("ProjectExpense").select("amount, taxRate").eq("invoiceId", invoiceId),
    sb.from("InvoiceProfit").select("*").eq("invoiceId", invoiceId).maybeSingle(),
  ])
  if (!profit) return
  const receivedCost = (receivedRows ?? []).reduce((sum: number, row: any) => sum + taxExcludedFromIncluded(row.amount, 10), 0)
  const extraCost = (expenseRows ?? []).reduce((sum: number, row: any) => sum + taxExcludedFromIncluded(row.amount, row.taxRate), 0)
  const sales = Number(profit.sales ?? 0)
  const cost = receivedCost + extraCost
  const grossProfit = sales - cost
  const profitRate = sales > 0 ? (grossProfit / sales) * 100 : 0
  await sb.from("InvoiceProfit")
    .update({ cost, grossProfit, profitRate, updatedAt: new Date().toISOString() })
    .eq("invoiceId", invoiceId)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const sb = getSb()
    const { data: target, error: targetError } = await sb.from("ProjectExpense")
      .select("id, companyId, invoiceId")
      .eq("id", id)
      .maybeSingle()
    if (targetError) throw new Error(targetError.message)
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (target.companyId !== (session.user as any).companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { error } = await sb.from("ProjectExpense").delete().eq("id", id)
    if (error) throw new Error(error.message)
    await syncProfit(sb, target.invoiceId)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[project-expenses DELETE]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
