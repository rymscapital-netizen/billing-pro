import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

// 紐づき後に InvoiceProfit.cost を再計算
async function syncProfit(sb: ReturnType<typeof getSb>, invoiceId: string) {
  const { data: rows } = await sb.from("ReceivedInvoice")
    .select("amount").eq("invoiceId", invoiceId)
  if (!rows?.length) return

  const totalInc    = rows.reduce((s: number, r: any) => s + Number(r.amount), 0)
  const cost        = Math.round(totalInc / 1.1)

  const { data: profit } = await sb.from("InvoiceProfit")
    .select("*").eq("invoiceId", invoiceId).limit(1)
  if (!profit?.length) return

  const sales       = Number(profit[0].sales)
  const grossProfit = sales - cost
  const profitRate  = sales > 0 ? (grossProfit / sales) * 100 : 0

  await sb.from("InvoiceProfit")
    .update({ cost, grossProfit, profitRate, updatedAt: new Date().toISOString() })
    .eq("invoiceId", invoiceId)
}

const patchSchema = z.object({
  invoiceId:     z.string().nullable().optional(),
  invoiceNumber: z.string().optional(),
  vendorName:    z.string().min(1).optional(),
  subject:       z.string().min(1).optional(),
  issueDate:     z.string().optional(),
  dueDate:       z.string().optional(),
  amount:        z.number().positive().optional(),
  notes:         z.string().nullable().optional(),
})

// PATCH: 紐づけ更新 or フィールド編集
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const u = session.user as any

  const sb = getSb()

  // テナント確認
  const { data: target } = await sb.from("ReceivedInvoice")
    .select("invoiceId, ownerCompanyId").eq("id", id).limit(1)
  if (!target?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (target[0].ownerCompanyId !== u.companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const prevInvoiceId = target[0].invoiceId ?? null
  const body = patchSchema.parse(await req.json())

  const updates: Record<string, any> = { updatedAt: new Date().toISOString() }
  if (body.invoiceNumber !== undefined) updates.invoiceNumber = body.invoiceNumber
  if (body.vendorName    !== undefined) updates.vendorName    = body.vendorName
  if (body.subject       !== undefined) updates.subject       = body.subject
  if (body.issueDate     !== undefined) updates.issueDate     = new Date(body.issueDate).toISOString()
  if (body.dueDate       !== undefined) updates.dueDate       = new Date(body.dueDate).toISOString()
  if (body.amount        !== undefined) updates.amount        = body.amount
  if (body.notes         !== undefined) updates.notes         = body.notes
  if ("invoiceId" in body)             updates.invoiceId      = body.invoiceId ?? null

  const { data: updated } = await sb.from("ReceivedInvoice")
    .update(updates).eq("id", id).select().limit(1)

  const newInvoiceId = "invoiceId" in body ? (body.invoiceId ?? null) : prevInvoiceId
  if (prevInvoiceId && prevInvoiceId !== newInvoiceId) await syncProfit(sb, prevInvoiceId)
  if (newInvoiceId) await syncProfit(sb, newInvoiceId)

  return NextResponse.json(updated?.[0])
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const u = session.user as any

  const sb = getSb()

  // テナント確認
  const { data: target } = await sb.from("ReceivedInvoice")
    .select("invoiceId, ownerCompanyId").eq("id", id).limit(1)
  if (!target?.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (target[0].ownerCompanyId !== u.companyId)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const prevInvoiceId = target[0].invoiceId ?? null
  await sb.from("ReceivedInvoice").delete().eq("id", id)
  if (prevInvoiceId) await syncProfit(sb, prevInvoiceId)

  return NextResponse.json({ success: true })
}
