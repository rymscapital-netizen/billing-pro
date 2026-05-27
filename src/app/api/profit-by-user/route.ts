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
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  const yearMonth = /^\d{4}-\d{2}$/.test(value ?? "") ? value! : fallback
  const [year, month] = yearMonth.split("-").map(Number)
  const start = new Date(Date.UTC(year, month - 1, 1) - 9 * 60 * 60 * 1000)
  const endExclusive = new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000)
  return { yearMonth, start, endExclusive }
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

function buildTotals(sourceGroups: any[]) {
  const totals = sourceGroups.reduce((sum, group) => ({
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

  return {
    ...totals,
    profitRate: totals.sales > 0 ? (totals.grossProfit / totals.sales) * 100 : 0,
  }
}

function formatYearMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatJstYearMonth(value: string) {
  const date = new Date(value)
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`
}

function buildHistory(rows: any[], selectedYearMonth: string) {
  const [year, month] = selectedYearMonth.split("-").map(Number)
  const monthStarts = Array.from({ length: 12 }, (_, index) => new Date(year, month - 12 + index, 1))
  const rowsByMonth = new Map<string, any[]>()

  for (const row of rows) {
    if (!row.dueDate) continue
    const key = formatJstYearMonth(row.dueDate)
    const current = rowsByMonth.get(key) ?? []
    current.push(row)
    rowsByMonth.set(key, current)
  }

  return monthStarts.map(monthStart => {
    const key = formatYearMonth(monthStart)
    const totals = buildTotals(groupDueInvoices(rowsByMonth.get(key) ?? []))

    return {
      month: key,
      label: `${monthStart.getFullYear()}/${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
      sales: totals.sales,
      cost: totals.cost,
      grossProfit: totals.grossProfit,
      amount: totals.amount,
      confirmedAmount: totals.confirmedAmount,
      unconfirmedAmount: totals.unconfirmedAmount,
      invoiceCount: totals.invoiceCount,
      missingProfitCount: totals.missingProfitCount,
      profitRate: totals.profitRate,
    }
  })
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const { yearMonth, start, endExclusive } = parseMonth(searchParams.get("yearMonth"))
    const assignedUserId = searchParams.get("assignedUserId")
    const sb = getSupabase()
    const [selectedYear, selectedMonth] = yearMonth.split("-").map(Number)
    const historyStart = new Date(Date.UTC(selectedYear, selectedMonth - 12, 1) - 9 * 60 * 60 * 1000)

    let query: any = sb.from("Invoice")
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, status, assignedUserId, assignedUser:User!assignedUserId(id, name), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .neq("status", "DRAFT")
      .gte("dueDate", start.toISOString())
      .lt("dueDate", endExclusive.toISOString())
      .order("dueDate", { ascending: false })

    let historyQuery: any = sb.from("Invoice")
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, status, assignedUserId, assignedUser:User!assignedUserId(id, name), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .neq("status", "DRAFT")
      .gte("dueDate", historyStart.toISOString())
      .lt("dueDate", endExclusive.toISOString())
      .order("dueDate", { ascending: false })

    if (assignedUserId) {
      query = query.eq("assignedUserId", assignedUserId)
      historyQuery = historyQuery.eq("assignedUserId", assignedUserId)
    }

    const [
      { data, error },
      { data: historyRows, error: historyError },
      { data: userRows, error: userError },
    ] = await Promise.all([
      query,
      historyQuery,
      sb.from("User")
        .select("id, name")
        .eq("companyId", session.user.companyId)
        .eq("isActive", true)
        .order("name", { ascending: true }),
    ])
    if (error) throw new Error(error.message)
    if (historyError) throw new Error(historyError.message)
    if (userError) throw new Error(userError.message)

    const groups = groupDueInvoices(data ?? [])
    const totals = buildTotals(groups)

    return NextResponse.json({
      month: yearMonth,
      users: userRows ?? [],
      totals,
      groups,
      history: buildHistory(historyRows ?? [], yearMonth),
    })
  } catch (e: any) {
    console.error("[profit-by-user ERROR]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
