import { auth } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

function parseMonth(value: string | null) {
  const now = new Date()
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const yearMonth = /^\d{4}-\d{2}$/.test(value ?? "") ? value! : fallback
  const [year, month] = yearMonth.split("-").map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { yearMonth, start, end }
}

const toNumber = (value: unknown) => Number(value ?? 0)

function addInvoiceToGroups(
  groups: Map<string, any>,
  row: any,
  options: { basisDate: string | null; confirmedAmount: number }
) {
  const assignedUser = Array.isArray(row.assignedUser) ? row.assignedUser[0] : row.assignedUser
  const company = Array.isArray(row.company) ? row.company[0] : row.company
  const profit = Array.isArray(row.profit) ? row.profit[0] : row.profit
  const userId = assignedUser?.id ?? "unassigned"
  const userName = assignedUser?.name ?? "未設定"
  const sales = profit ? toNumber(profit.sales) : toNumber(row.subtotal)
  const cost = profit ? toNumber(profit.cost) : 0
  const grossProfit = profit ? toNumber(profit.grossProfit) : sales - cost
  const amount = toNumber(row.amount)
  const confirmedAmount = options.confirmedAmount

  const current = groups.get(userId) ?? {
    userId,
    userName,
    sales: 0,
    cost: 0,
    grossProfit: 0,
    amount: 0,
    confirmedAmount: 0,
    unconfirmedAmount: 0,
    invoiceCount: 0,
    missingProfitCount: 0,
    items: [],
  }

  current.sales += sales
  current.cost += cost
  current.grossProfit += grossProfit
  current.amount += amount
  current.confirmedAmount += confirmedAmount
  current.unconfirmedAmount += Math.max(amount - confirmedAmount, 0)
  current.invoiceCount += 1
  if (!profit) current.missingProfitCount += 1
  current.items.push({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    companyName: company?.name ?? "未設定",
    subject: row.subject,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    paymentDate: options.basisDate,
    sales,
    cost,
    grossProfit,
    amount,
    status: row.status,
    hasProfit: Boolean(profit),
  })

  groups.set(userId, current)
}

function sortGroups(groups: Map<string, any>) {
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      profitRate: group.sales > 0 ? (group.grossProfit / group.sales) * 100 : 0,
      items: group.items.sort((a: any, b: any) => String(b.paymentDate).localeCompare(String(a.paymentDate))),
    }))
    .sort((a, b) => b.grossProfit - a.grossProfit)
}

function groupPayments(rows: any[]) {
  const groups = new Map<string, any>()

  for (const paymentRow of rows) {
    const row = Array.isArray(paymentRow.invoice) ? paymentRow.invoice[0] : paymentRow.invoice
    if (!row) continue

    const amount = toNumber(row.amount)
    addInvoiceToGroups(groups, row, {
      basisDate: paymentRow.paymentDate,
      confirmedAmount: toNumber(paymentRow.paymentAmount ?? amount),
    })
  }

  return sortGroups(groups)
}

function groupDueInvoices(rows: any[]) {
  const groups = new Map<string, any>()

  for (const row of rows) {
    const payments = Array.isArray(row.payments) ? row.payments : []
    const confirmedAmount = ["PAYMENT_CONFIRMED", "CLEARED"].includes(row.status)
      ? toNumber(row.amount)
      : payments
          .filter((payment: any) => payment.paymentStatus === "CONFIRMED")
          .reduce((sum: number, payment: any) => sum + toNumber(payment.paymentAmount), 0)

    addInvoiceToGroups(groups, row, {
      basisDate: row.dueDate,
      confirmedAmount,
    })
  }

  return sortGroups(groups)
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const { yearMonth, start, end } = parseMonth(searchParams.get("yearMonth"))
    const assignedUserId = searchParams.get("assignedUserId")
    const sb = getSupabase()

    let paymentQuery: any = sb.from("InvoicePayment")
      .select("paymentDate, paymentAmount, invoice:Invoice!inner(id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, status, assignedUserId, issuerCompanyId, assignedUser:User!assignedUserId(id, name), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*))")
      .eq("paymentStatus", "CONFIRMED")
      .eq("invoice.issuerCompanyId", session.user.companyId)
      .neq("invoice.status", "DRAFT")
      .gte("paymentDate", start.toISOString())
      .lte("paymentDate", end.toISOString())
      .order("paymentDate", { ascending: false })

    let unpaidQuery: any = sb.from("Invoice")
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, status, assignedUserId, assignedUser:User!assignedUserId(id, name), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .in("status", ["ISSUED", "PENDING", "OVERDUE"])
      .gte("dueDate", start.toISOString())
      .lte("dueDate", end.toISOString())
      .order("dueDate", { ascending: false })

    if (assignedUserId) {
      paymentQuery = paymentQuery.eq("invoice.assignedUserId", assignedUserId)
      unpaidQuery = unpaidQuery.eq("assignedUserId", assignedUserId)
    }

    const [
      { data: paymentRows, error: paymentError },
      { data: unpaidRows, error: unpaidError },
      { data: userRows, error: userError },
    ] = await Promise.all([
      paymentQuery,
      unpaidQuery,
      sb.from("User")
        .select("id, name")
        .eq("companyId", session.user.companyId)
        .eq("isActive", true)
        .order("name", { ascending: true }),
    ])
    if (paymentError) throw new Error(paymentError.message)
    if (unpaidError) throw new Error(unpaidError.message)
    if (userError) throw new Error(userError.message)

    const groups = groupPayments(paymentRows ?? [])
    const unpaidGroups = groupDueInvoices(unpaidRows ?? [])
    const buildTotals = (sourceGroups: any[]) => sourceGroups.reduce((sum, group) => ({
      sales: sum.sales + group.sales,
      cost: sum.cost + group.cost,
      grossProfit: sum.grossProfit + group.grossProfit,
      amount: sum.amount + group.amount,
      confirmedAmount: sum.confirmedAmount + group.confirmedAmount,
      unconfirmedAmount: sum.unconfirmedAmount + group.unconfirmedAmount,
      invoiceCount: sum.invoiceCount + group.invoiceCount,
      missingProfitCount: sum.missingProfitCount + group.missingProfitCount,
    }), {
      sales: 0,
      cost: 0,
      grossProfit: 0,
      amount: 0,
      confirmedAmount: 0,
      unconfirmedAmount: 0,
      invoiceCount: 0,
      missingProfitCount: 0,
    })
    const totals = buildTotals(groups)
    const unpaidTotals = buildTotals(unpaidGroups)

    return NextResponse.json({
      month: yearMonth,
      users: userRows ?? [],
      totals: {
        ...totals,
        profitRate: totals.sales > 0 ? (totals.grossProfit / totals.sales) * 100 : 0,
      },
      groups,
      unpaidTotals: {
        ...unpaidTotals,
        profitRate: unpaidTotals.sales > 0 ? (unpaidTotals.grossProfit / unpaidTotals.sales) * 100 : 0,
      },
      unpaidGroups,
    })
  } catch (e: any) {
    console.error("[profit-by-user ERROR]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
