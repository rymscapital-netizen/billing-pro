import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

function normalizeInvoice(row: any) {
  return {
    ...row,
    company: Array.isArray(row.company) ? (row.company[0] ?? null) : row.company,
    payments: Array.isArray(row.payments) ? row.payments : [],
    profit: Array.isArray(row.profit) ? (row.profit[0] ?? null) : row.profit,
    assignedUser: Array.isArray(row.assignedUser)
      ? (row.assignedUser[0] ?? null)
      : row.assignedUser,
  }
}

const invoiceSelect =
  "*, company:Company!companyId(*), payments:InvoicePayment(*), profit:InvoiceProfit(*), assignedUser:User!assignedUserId(id,name)"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const u = session.user as any
  const sb = getSb()
  const { data: invoiceRow, error } = await sb.from("Invoice")
    .select(invoiceSelect)
    .eq("id", id)
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoiceRow) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const invoice = normalizeInvoice(invoiceRow)
  const isIssuer = invoice.issuerCompanyId === u.companyId
  const isRecipient = invoice.companyId === u.companyId
  if (!isIssuer && !isRecipient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!isIssuer) {
    invoice.profit = null
  }

  let linkedReceivedInvoices: any[] = []
  if (u.role === "ADMIN") {
    const { data } = await sb.from("ReceivedInvoice")
      .select("*")
      .eq("invoiceId", id)
      .eq("ownerCompanyId", u.companyId)
      .order("dueDate", { ascending: true })
    linkedReceivedInvoices = data ?? []
  }

  return NextResponse.json({ ...invoice, linkedReceivedInvoices })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any
  const sb = getSb()

  const { data: inv, error: invError } = await sb.from("Invoice")
    .select("issuerCompanyId, subtotal")
    .eq("id", id)
    .limit(1)
    .maybeSingle()
  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 })
  if (!inv || inv.issuerCompanyId !== u.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, any> = { updatedAt: new Date().toISOString() }

  if (body.subject !== undefined) data.subject = body.subject
  if (body.issueDate !== undefined) data.issueDate = new Date(body.issueDate).toISOString()
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate).toISOString()
  if (body.notes !== undefined) data.notes = body.notes || null
  if (body.assignedUserId !== undefined) data.assignedUserId = body.assignedUserId || null
  if (body.subtotal !== undefined) {
    const tax = body.tax ?? 0
    data.subtotal = body.subtotal
    data.tax = tax
    data.amount = body.subtotal + tax
  }

  const { data: updatedRow, error: updateError } = await sb.from("Invoice")
    .update(data)
    .eq("id", id)
    .select(invoiceSelect)
    .limit(1)
    .maybeSingle()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!updatedRow) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let updated = normalizeInvoice(updatedRow)

  if (body.cost !== undefined || body.sales !== undefined) {
    const sales = body.sales !== undefined
      ? Number(body.sales)
      : Number(updated.profit?.sales ?? updated.subtotal ?? inv.subtotal)
    const cost = body.cost !== undefined
      ? Number(body.cost)
      : Number(updated.profit?.cost ?? 0)
    const grossProfit = sales - cost
    const profitRate = sales > 0 ? (grossProfit / sales) * 100 : 0
    const now = new Date().toISOString()

    const { data: existingProfit, error: profitFindError } = await sb.from("InvoiceProfit")
      .select("id")
      .eq("invoiceId", id)
      .limit(1)
      .maybeSingle()
    if (profitFindError) {
      return NextResponse.json({ error: profitFindError.message }, { status: 500 })
    }

    if (existingProfit?.id) {
      const { error: profitUpdateError } = await sb.from("InvoiceProfit")
        .update({ sales, cost, grossProfit, profitRate, updatedAt: now })
        .eq("invoiceId", id)
      if (profitUpdateError) {
        return NextResponse.json({ error: profitUpdateError.message }, { status: 500 })
      }
    } else {
      const { error: profitInsertError } = await sb.from("InvoiceProfit")
        .insert({
          id: crypto.randomUUID(),
          invoiceId: id,
          sales,
          cost,
          grossProfit,
          profitRate,
          createdAt: now,
          updatedAt: now,
        })
      if (profitInsertError) {
        return NextResponse.json({ error: profitInsertError.message }, { status: 500 })
      }
    }

    updated = {
      ...updated,
      profit: { ...(updated.profit ?? {}), sales, cost, grossProfit, profitRate },
    }
  }

  const rcvUpdates: Record<string, any> = { updatedAt: new Date().toISOString() }
  if (body.subject !== undefined) rcvUpdates.subject = body.subject
  if (body.issueDate !== undefined) rcvUpdates.issueDate = new Date(body.issueDate).toISOString()
  if (body.dueDate !== undefined) rcvUpdates.dueDate = new Date(body.dueDate).toISOString()
  if (body.notes !== undefined) rcvUpdates.notes = body.notes || null
  if (body.subtotal !== undefined) rcvUpdates.amount = body.subtotal + (body.tax ?? 0)

  if (Object.keys(rcvUpdates).length > 1) {
    const { error: rcvError } = await sb.from("ReceivedInvoice")
      .update(rcvUpdates)
      .eq("invoiceId", id)
    if (rcvError) console.error("[invoices PATCH] ReceivedInvoice sync failed:", rcvError.message)
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const u = session.user as any

  const inv = await prisma.invoice.findUnique({ where: { id }, select: { issuerCompanyId: true } }) as any
  if (!inv || inv.issuerCompanyId !== u.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const sb = getSb()
    await sb.from("ReceivedInvoice").delete().eq("invoiceId", id)
  } catch (e: any) {
    console.error("[invoices DELETE] ReceivedInvoice cleanup failed:", e?.message)
  }

  await prisma.invoicePayment.deleteMany({ where: { invoiceId: id } })
  await prisma.invoiceProfit.deleteMany({ where: { invoiceId: id } })
  await prisma.ocrJob.deleteMany({ where: { invoiceId: id } })
  await prisma.invoice.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
