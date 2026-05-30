import { auth } from "@/lib/auth"
import { taxExcludedFromIncluded } from "@/lib/commission"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().positive().max(999999999),
  taxRate: z.number().min(0).max(100).default(10),
  expenseDate: z.string().optional().nullable(),
  memo: z.string().max(500).optional().nullable(),
})

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

async function assertInvoiceOwner(sb: ReturnType<typeof getSb>, invoiceId: string, companyId: string) {
  const { data, error } = await sb.from("Invoice")
    .select("id, issuerCompanyId")
    .eq("id", invoiceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data && data.issuerCompanyId === companyId)
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const sb = getSb()
    if (!await assertInvoiceOwner(sb, id, (session.user as any).companyId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data, error } = await sb.from("ProjectExpense")
      .select("*")
      .eq("invoiceId", id)
      .order("expenseDate", { ascending: true })
      .order("createdAt", { ascending: true })
    if (error) throw new Error(error.message)
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    console.error("[project-expenses GET]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const sb = getSb()
    const companyId = (session.user as any).companyId
    if (!await assertInvoiceOwner(sb, id, companyId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = schema.parse(await req.json())
    const now = new Date().toISOString()
    const { data, error } = await sb.from("ProjectExpense")
      .insert({
        id: crypto.randomUUID(),
        companyId,
        invoiceId: id,
        label: body.label,
        amount: body.amount,
        taxRate: body.taxRate,
        expenseDate: body.expenseDate ? new Date(body.expenseDate).toISOString() : null,
        memo: body.memo ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .select("*")
      .single()
    if (error) throw new Error(error.message)
    await syncProfit(sb, id)
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    console.error("[project-expenses POST]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
