import { auth } from "@/lib/auth"
import {
  calculateIruchijimaCommissionableGrossProfit,
  calculateProjectGrossProfit,
  IRUCHIJIMA_COMMISSION_START_MONTH,
  IRUCHIJIMA_COMMISSION_USER_NAME,
  resolveCommissionRate,
  resolveFiscalRange,
  resolveMonthRange,
  resolvePaymentDate,
} from "@/lib/commission"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

function toNumber(value: unknown) {
  return Number(value ?? 0)
}

function formatMonthEnd(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number)
  return new Date(year, month, 0, 23, 59, 59, 999).toISOString()
}

function normalizeAssignments(row: any) {
  const assignments = Array.isArray(row.assignments) ? row.assignments : []
  if (assignments.length > 0) {
    return assignments
      .map((assignment: any) => {
        const user = Array.isArray(assignment.user) ? assignment.user[0] : assignment.user
      return {
        userId: assignment.userId ?? user?.id,
        shareRate: toNumber(assignment.shareRate),
        commissionMode: user?.commissionMode ?? "STANDARD",
        commissionRate: toNumber(user?.commissionRate),
      }
      })
      .filter((assignment: any) => assignment.userId && assignment.shareRate > 0)
  }

  const assignedUser = Array.isArray(row.assignedUser) ? row.assignedUser[0] : row.assignedUser
  return assignedUser?.id
    ? [{ userId: assignedUser.id, shareRate: 100, commissionMode: assignedUser.commissionMode ?? "STANDARD", commissionRate: toNumber(assignedUser.commissionRate) }]
    : []
}

async function buildPreview(sb: ReturnType<typeof getSb>, companyId: string, userId: string, yearMonth: string) {
  const fiscal = resolveFiscalRange(yearMonth)
  const month = resolveMonthRange(yearMonth)
  const closingDate = formatMonthEnd(yearMonth)
  const { data: userRow, error: userError } = await sb.from("User")
    .select("id, name, commissionMode, commissionRate")
    .eq("id", userId)
    .eq("companyId", companyId)
    .maybeSingle()
  if (userError) throw new Error(userError.message)
  if (!userRow) throw new Error("User not found")

  const { data: invoices, error: invoiceError } = await sb.from("Invoice")
    .select("id, subtotal, dueDate, status, payments:InvoicePayment(*), assignedUser:User!assignedUserId(id, commissionMode, commissionRate), assignments:InvoiceAssignment(*, user:User!userId(id, commissionMode, commissionRate)), profit:InvoiceProfit(*), projectExpenses:ProjectExpense(*)")
    .eq("issuerCompanyId", companyId)
    .in("status", ["PAYMENT_CONFIRMED", "CLEARED"])
  if (invoiceError) throw new Error(invoiceError.message)

  const { data: manualProfits, error: manualProfitError } = await sb.from("ManualProfit")
    .select("id, amount, profitDate, yearMonth")
    .eq("companyId", companyId)
    .eq("userId", userId)
    .gte("profitDate", fiscal.start)
    .lt("profitDate", month.endExclusive)
  if (manualProfitError) throw new Error(manualProfitError.message)

  const invoiceIds = (invoices ?? []).map((invoice: any) => invoice.id)
  const { data: receivedRows, error: receivedError } = invoiceIds.length > 0
    ? await sb.from("ReceivedInvoice").select("*").in("invoiceId", invoiceIds)
    : { data: [], error: null }
  if (receivedError) throw new Error(receivedError.message)
  const receivedByInvoiceId = new Map<string, any[]>()
  for (const row of receivedRows ?? []) {
    const current = receivedByInvoiceId.get(row.invoiceId) ?? []
    current.push(row)
    receivedByInvoiceId.set(row.invoiceId, current)
  }

  let cumulativeGrossProfit = 0
  let monthGrossProfit = 0
  const grossProfitByMonth = new Map<string, number>()
  let commissionMode = userRow.commissionMode ?? "STANDARD"
  let fixedCommissionRate = toNumber(userRow.commissionRate)
  const items: any[] = []

  for (const invoice of invoices ?? []) {
    const payment = (Array.isArray(invoice.payments) ? invoice.payments : [])
      .find((row: any) => row.paymentStatus === "CONFIRMED" && row.paymentDate)
    if (!payment?.paymentDate) continue
    if (!invoice.dueDate || invoice.dueDate < fiscal.start || invoice.dueDate >= month.endExclusive) continue

    const assignments = normalizeAssignments(invoice)
    const assignment = assignments.find((row: any) => row.userId === userId)
    if (!assignment) continue

    commissionMode = assignment.commissionMode ?? commissionMode
    fixedCommissionRate = toNumber(assignment.commissionRate)
    const project = calculateProjectGrossProfit({
      ...invoice,
      linkedReceivedInvoices: receivedByInvoiceId.get(invoice.id) ?? [],
    })
    const share = assignment.shareRate / 100
    const grossProfit = project.grossProfit * share
    cumulativeGrossProfit += grossProfit
    const invoiceMonth = String(invoice.dueDate).slice(0, 7)
    grossProfitByMonth.set(invoiceMonth, (grossProfitByMonth.get(invoiceMonth) ?? 0) + grossProfit)
    if (invoice.dueDate >= month.start && invoice.dueDate < month.endExclusive) {
      monthGrossProfit += grossProfit
    }
    items.push({
      invoiceId: invoice.id,
      paymentDate: payment.paymentDate,
      dueDate: invoice.dueDate,
      shareRate: assignment.shareRate,
      grossProfit,
    })
  }

  for (const row of manualProfits ?? []) {
    const grossProfit = toNumber(row.amount)
    cumulativeGrossProfit += grossProfit
    const manualMonth = row.yearMonth ?? String(row.profitDate).slice(0, 7)
    grossProfitByMonth.set(manualMonth, (grossProfitByMonth.get(manualMonth) ?? 0) + grossProfit)
    if (row.profitDate >= month.start && row.profitDate < month.endExclusive) {
      monthGrossProfit += grossProfit
    }
    items.push({
      manualProfitId: row.id,
      paymentDate: row.profitDate,
      dueDate: row.profitDate,
      shareRate: 100,
      grossProfit,
    })
  }

  const isIruchijimaSpecialRule = userRow.name === IRUCHIJIMA_COMMISSION_USER_NAME
    && yearMonth >= IRUCHIJIMA_COMMISSION_START_MONTH
  const fiscalMonthGrossProfits: { yearMonth: string; grossProfit: number }[] = []
  if (isIruchijimaSpecialRule) {
    let cursor = fiscal.fiscalYearStartMonth
    while (cursor <= yearMonth) {
      fiscalMonthGrossProfits.push({ yearMonth: cursor, grossProfit: grossProfitByMonth.get(cursor) ?? 0 })
      const [cursorYear, cursorMonth] = cursor.split("-").map(Number)
      cursor = cursorMonth === 12
        ? `${cursorYear + 1}-01`
        : `${cursorYear}-${String(cursorMonth + 1).padStart(2, "0")}`
    }
  }
  const specialCalculation = isIruchijimaSpecialRule
    ? calculateIruchijimaCommissionableGrossProfit(fiscalMonthGrossProfits)
    : null
  const cumulativeCommissionableGrossProfit = specialCalculation?.cumulativeCommissionableGrossProfit
    ?? cumulativeGrossProfit
  const commissionRate = resolveCommissionRate(cumulativeGrossProfit, commissionMode as any, fixedCommissionRate)
  const cumulativeCommissionAmount = Math.round(cumulativeCommissionableGrossProfit * (commissionRate / 100))

  const { data: priorPayouts, error: payoutError } = await sb.from("CommissionPayout")
    .select("payoutAmount, yearMonth")
    .eq("companyId", companyId)
    .eq("userId", userId)
    .eq("fiscalYearStartMonth", fiscal.fiscalYearStartMonth)
    .lt("yearMonth", yearMonth)
  if (payoutError) throw new Error(payoutError.message)
  const priorPaidAmount = (priorPayouts ?? []).reduce((sum: number, row: any) => sum + toNumber(row.payoutAmount), 0)
  const isCatchUpMode = commissionMode === "STANDARD" || isIruchijimaSpecialRule
  const payoutAmount = isCatchUpMode
    ? Math.max(cumulativeCommissionAmount - priorPaidAmount, 0)
    : Math.round(monthGrossProfit * (commissionRate / 100))

  const { data: existing, error: existingError } = await sb.from("CommissionPayout")
    .select("*")
    .eq("userId", userId)
    .eq("yearMonth", yearMonth)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)

  return {
    userId,
    yearMonth,
    fiscalYearStartMonth: fiscal.fiscalYearStartMonth,
    closingDate,
    paymentDate: resolvePaymentDate(yearMonth),
    commissionMode,
    monthGrossProfit: Math.round(monthGrossProfit),
    cumulativeGrossProfit: Math.round(cumulativeGrossProfit),
    cumulativeCommissionableGrossProfit: Math.round(cumulativeCommissionableGrossProfit),
    carriedDeficit: Math.round(specialCalculation?.carriedDeficit ?? 0),
    specialCommissionRuleApplied: isIruchijimaSpecialRule,
    commissionRate,
    cumulativeCommissionAmount,
    priorPaidAmount: Math.round(priorPaidAmount),
    payoutAmount,
    existing,
    items,
  }
}

const schema = z.object({
  userId: z.string().min(1),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
})

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const body = schema.parse({
      userId: searchParams.get("userId"),
      yearMonth: searchParams.get("yearMonth"),
    })
    const sb = getSb()
    return NextResponse.json(await buildPreview(sb, (session.user as any).companyId, body.userId, body.yearMonth))
  } catch (e: any) {
    console.error("[commission-payouts GET]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const body = schema.parse(await req.json())
    const sb = getSb()
    const companyId = (session.user as any).companyId
    const preview = await buildPreview(sb, companyId, body.userId, body.yearMonth)
    const now = new Date().toISOString()
    const payload = {
      companyId,
      userId: body.userId,
      yearMonth: body.yearMonth,
      fiscalYearStartMonth: preview.fiscalYearStartMonth,
      closingDate: preview.closingDate,
      paymentDate: preview.paymentDate,
      cumulativeGrossProfit: preview.cumulativeGrossProfit,
      commissionRate: preview.commissionRate,
      cumulativeCommissionAmount: preview.cumulativeCommissionAmount,
      priorPaidAmount: preview.priorPaidAmount,
      payoutAmount: preview.payoutAmount,
      createdByUserId: (session.user as any).id,
      updatedAt: now,
    }

    const mutation = preview.existing?.id
      ? sb.from("CommissionPayout").update(payload).eq("id", preview.existing.id).select("*").single()
      : sb.from("CommissionPayout").insert({ ...payload, id: crypto.randomUUID(), createdAt: now }).select("*").single()
    const { data, error } = await mutation
    if (error) throw new Error(error.message)
    return NextResponse.json({ ...preview, existing: data })
  } catch (e: any) {
    console.error("[commission-payouts POST]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
