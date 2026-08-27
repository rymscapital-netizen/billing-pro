import { auth } from "@/lib/auth"
import { calculateInvoiceProfit, calculateProjectGrossProfit } from "@/lib/commission"
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
  const storedProfit = Array.isArray(row.profit) ? (row.profit[0] ?? null) : row.profit
  const canonicalProfit = storedProfit
    ? { ...storedProfit, ...calculateInvoiceProfit(row.subtotal, storedProfit.cost) }
    : null
  return {
    ...row,
    company: Array.isArray(row.company) ? (row.company[0] ?? null) : row.company,
    payments: Array.isArray(row.payments) ? row.payments : [],
    profit: canonicalProfit,
    projectExpenses: Array.isArray(row.projectExpenses) ? row.projectExpenses : [],
    assignedUser: Array.isArray(row.assignedUser)
      ? (row.assignedUser[0] ?? null)
      : row.assignedUser,
    assignments: Array.isArray(row.assignments)
      ? row.assignments.map((assignment: any) => ({
          ...assignment,
          user: Array.isArray(assignment.user) ? (assignment.user[0] ?? null) : assignment.user,
        }))
      : [],
  }
}

const invoiceSelect =
  "*, company:Company!companyId(*), payments:InvoicePayment(*), profit:InvoiceProfit(*), projectExpenses:ProjectExpense(*), assignedUser:User!assignedUserId(id,name), assignments:InvoiceAssignment(*, user:User!userId(id,name))"

function normalizeAssignments(assignments: { userId?: string; shareRate?: number }[] | undefined, assignedUserId?: string | null) {
  const source = assignments?.length
    ? assignments
    : assignedUserId
      ? [{ userId: assignedUserId, shareRate: 100 }]
      : []
  const merged = new Map<string, number>()
  for (const assignment of source) {
    if (!assignment.userId) continue
    merged.set(assignment.userId, (merged.get(assignment.userId) ?? 0) + Number(assignment.shareRate ?? 0))
  }
  const rows = Array.from(merged.entries()).map(([userId, shareRate]) => ({ userId, shareRate }))
  const total = rows.reduce((sum, row) => sum + row.shareRate, 0)
  if (rows.length > 0 && Math.round(total * 100) !== 10000) {
    throw new Error("担当者の売上割合の合計は100%にしてください")
  }
  return rows
}

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

  return NextResponse.json({
    ...invoice,
    linkedReceivedInvoices,
    projectGrossProfit: calculateProjectGrossProfit({ ...invoice, linkedReceivedInvoices }),
  })
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
  const normalizedAssignments = body.assignments !== undefined
    ? normalizeAssignments(body.assignments, body.assignedUserId)
    : null
  if (body.assignedUserId !== undefined || normalizedAssignments) {
    data.assignedUserId = normalizedAssignments?.[0]?.userId ?? body.assignedUserId ?? null
  }
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

  if (normalizedAssignments) {
    const now = new Date().toISOString()
    const { error: deleteAssignmentsError } = await sb.from("InvoiceAssignment")
      .delete()
      .eq("invoiceId", id)
    if (deleteAssignmentsError) return NextResponse.json({ error: deleteAssignmentsError.message }, { status: 500 })
    if (normalizedAssignments.length > 0) {
      const { error: insertAssignmentsError } = await sb.from("InvoiceAssignment")
        .insert(normalizedAssignments.map(assignment => ({
          id: crypto.randomUUID(),
          invoiceId: id,
          userId: assignment.userId,
          shareRate: assignment.shareRate,
          createdAt: now,
          updatedAt: now,
        })))
      if (insertAssignmentsError) return NextResponse.json({ error: insertAssignmentsError.message }, { status: 500 })
    }
    updated.assignments = normalizedAssignments.map(assignment => ({ ...assignment, invoiceId: id }))
  }

  if (body.cost !== undefined || body.sales !== undefined || body.subtotal !== undefined) {
    // Invoice subtotal is the canonical tax-exclusive sales amount. Keeping a
    // second independently rounded sales value causes one-yen discrepancies.
    const sales = Number(updated.subtotal ?? inv.subtotal)
    const cost = body.cost !== undefined
      ? Number(body.cost)
      : Number(updated.profit?.cost ?? 0)
    const { grossProfit, profitRate } = calculateInvoiceProfit(sales, cost)
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
