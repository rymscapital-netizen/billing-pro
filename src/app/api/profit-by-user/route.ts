import { auth } from "@/lib/auth"
import { canViewInternalReports } from "@/lib/internal-access"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

function canViewAllProfitUsers(user: any) {
  return String(user?.name ?? "").includes("\u6d6a\u7530")
}

function parseMonth(value: string | null) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const fallback = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  const yearMonth = /^\d{4}-\d{2}$/.test(value ?? "") ? value! : fallback
  const [year, month] = yearMonth.split("-").map(Number)
  const start = toDbMonthStart(year, month - 1)
  const endExclusive = toDbMonthStart(year, month)
  return { yearMonth, start, endExclusive }
}

const toNumber = (value: unknown) => Number(value ?? 0)

const expenseFields = [
  "baseSalary",
  "socialInsurance",
  "rentAllocation",
  "paidCommission",
  "travelExpense",
  "corporateTax",
  "communicationCost",
  "welfareExpense",
  "suppliesExpense",
  "otherExpense",
] as const

const referenceDeductionFields = [
  "employeeSocialInsurance",
  "withholdingTax",
] as const

function calculateExpenseTotal(expense: any) {
  return expenseFields.reduce((sum, field) => sum + toNumber(expense?.[field]), 0)
}

function normalizeExpense(expense: any) {
  const normalized: Record<string, any> = {
    id: expense?.id ?? null,
    userId: expense?.userId ?? null,
    yearMonth: expense?.yearMonth ?? null,
    otherMemo: expense?.otherMemo ?? "",
  }
  for (const field of expenseFields) normalized[field] = toNumber(expense?.[field])
  for (const field of referenceDeductionFields) normalized[field] = toNumber(expense?.[field])
  normalized.totalExpense = calculateExpenseTotal(expense)
  normalized.totalDeductionReference = referenceDeductionFields.reduce((sum, field) => sum + toNumber(expense?.[field]), 0)
  return normalized
}

function toDbMonthStart(year: number, monthIndex: number) {
  const date = new Date(year, monthIndex, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01T00:00:00`
}

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
  const commissionRate = toNumber(assignedUser?.commissionRate)
  const sales = profit ? toNumber(profit.sales) : toNumber(row.subtotal)
  const cost = profit ? toNumber(profit.cost) : 0
  const grossProfit = profit ? toNumber(profit.grossProfit) : sales - cost
  const amount = toNumber(row.amount)
  const confirmedAmount = options.confirmedAmount
  const commissionAmount = grossProfit * (commissionRate / 100)

  const current = groups.get(userId) ?? {
    userId,
    userName,
    commissionRate,
    sales: 0,
    cost: 0,
    grossProfit: 0,
    commissionAmount: 0,
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
  current.commissionAmount += commissionAmount
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
    commissionRate,
    commissionAmount,
    amount,
    status: row.status,
    hasProfit: Boolean(profit),
  })

  groups.set(userId, current)
}

function applyExpensesToGroups(groups: any[], expensesByUserId: Map<string, any>) {
  return groups.map(group => {
    const expense = normalizeExpense(expensesByUserId.get(group.userId))
    return {
      ...group,
      expenses: expense,
      totalExpense: expense.totalExpense,
      retainedProfit: group.grossProfit - expense.totalExpense,
    }
  })
}

function addExpenseOnlyGroups(groups: any[], users: any[], expensesByUserId: Map<string, any>) {
  const existingUserIds = new Set(groups.map(group => group.userId))
  const additionalGroups = users
    .filter(user => expensesByUserId.has(user.id) && !existingUserIds.has(user.id))
    .map(user => {
      const expense = normalizeExpense(expensesByUserId.get(user.id))
      return {
        userId: user.id,
        userName: user.name,
        commissionRate: toNumber(user.commissionRate),
        sales: 0,
        cost: 0,
        grossProfit: 0,
        commissionAmount: 0,
        amount: 0,
        confirmedAmount: 0,
        unconfirmedAmount: 0,
        invoiceCount: 0,
        missingProfitCount: 0,
        profitRate: 0,
        items: [],
        expenses: expense,
        totalExpense: expense.totalExpense,
        retainedProfit: -expense.totalExpense,
      }
    })

  return [...groups, ...additionalGroups].sort((a, b) => b.retainedProfit - a.retainedProfit)
}

function sortGroups(groups: Map<string, any>, expensesByUserId = new Map<string, any>()) {
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      profitRate: group.sales > 0 ? (group.grossProfit / group.sales) * 100 : 0,
      items: group.items.sort((a: any, b: any) => String(b.paymentDate).localeCompare(String(a.paymentDate))),
    }))
    .map(group => applyExpensesToGroups([group], expensesByUserId)[0])
    .sort((a, b) => b.grossProfit - a.grossProfit)
}

function groupDueInvoices(rows: any[], expensesByUserId = new Map<string, any>(), users: any[] = []) {
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

  return addExpenseOnlyGroups(sortGroups(groups, expensesByUserId), users, expensesByUserId)
}

function buildTotals(sourceGroups: any[]) {
  const totals = sourceGroups.reduce((sum, group) => ({
    sales: sum.sales + group.sales,
    cost: sum.cost + group.cost,
    grossProfit: sum.grossProfit + group.grossProfit,
    commissionAmount: sum.commissionAmount + group.commissionAmount,
    totalExpense: sum.totalExpense + toNumber(group.totalExpense),
    retainedProfit: sum.retainedProfit + toNumber(group.retainedProfit),
    amount: sum.amount + group.amount,
    confirmedAmount: sum.confirmedAmount + group.confirmedAmount,
    unconfirmedAmount: sum.unconfirmedAmount + group.unconfirmedAmount,
    invoiceCount: sum.invoiceCount + group.invoiceCount,
    missingProfitCount: sum.missingProfitCount + group.missingProfitCount,
  }), {
    sales: 0,
    cost: 0,
    grossProfit: 0,
    commissionAmount: 0,
    totalExpense: 0,
    retainedProfit: 0,
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
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  if (!hasExplicitTimezone) return value.slice(0, 7)

  const date = new Date(value)
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`
}

function buildFiscalMonths(selectedYearMonth: string) {
  const [year, month] = selectedYearMonth.split("-").map(Number)
  const fiscalStartYear = month >= 6 ? year : year - 1
  return Array.from({ length: 12 }, (_, index) => new Date(fiscalStartYear, 5 + index, 1))
}

function buildHistory(rows: any[], monthStarts: Date[], expenses: any[], users: any[]) {
  const rowsByMonth = new Map<string, any[]>()
  const expensesByMonth = new Map<string, any[]>()

  for (const row of rows) {
    if (!row.dueDate) continue
    const key = formatJstYearMonth(row.dueDate)
    const current = rowsByMonth.get(key) ?? []
    current.push(row)
    rowsByMonth.set(key, current)
  }

  for (const expense of expenses) {
    const current = expensesByMonth.get(expense.yearMonth) ?? []
    current.push(expense)
    expensesByMonth.set(expense.yearMonth, current)
  }

  return monthStarts.map(monthStart => {
    const key = formatYearMonth(monthStart)
    const expensesByUserId = new Map<string, any>((expensesByMonth.get(key) ?? []).map(expense => [expense.userId, expense]))
    const totals = buildTotals(groupDueInvoices(rowsByMonth.get(key) ?? [], expensesByUserId, users))

    return {
      month: key,
      label: `${monthStart.getFullYear()}/${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
      sales: totals.sales,
      cost: totals.cost,
      grossProfit: totals.grossProfit,
      commissionAmount: totals.commissionAmount,
      totalExpense: totals.totalExpense,
      retainedProfit: totals.retainedProfit,
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
    if (!canViewInternalReports(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const { yearMonth, start, endExclusive } = parseMonth(searchParams.get("yearMonth"))
    const requestedAssignedUserId = searchParams.get("assignedUserId")
    const canViewAllUsers = canViewAllProfitUsers(session.user)
    const effectiveAssignedUserId = canViewAllUsers
      ? requestedAssignedUserId
      : session.user.id
    const sb = getSupabase()
    const fiscalMonths = buildFiscalMonths(yearMonth)
    const fiscalStart = toDbMonthStart(fiscalMonths[0].getFullYear(), fiscalMonths[0].getMonth())
    const fiscalEndMonth = fiscalMonths[11]
    const fiscalEndExclusive = toDbMonthStart(fiscalEndMonth.getFullYear(), fiscalEndMonth.getMonth() + 1)
    const fiscalMonthKeys = fiscalMonths.map(formatYearMonth)

    let query: any = sb.from("Invoice")
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, status, assignedUserId, assignedUser:User!assignedUserId(id, name, commissionRate), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .neq("status", "DRAFT")
      .gte("dueDate", start)
      .lt("dueDate", endExclusive)
      .order("dueDate", { ascending: false })

    let historyQuery: any = sb.from("Invoice")
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, status, assignedUserId, assignedUser:User!assignedUserId(id, name, commissionRate), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .neq("status", "DRAFT")
      .gte("dueDate", fiscalStart)
      .lt("dueDate", fiscalEndExclusive)
      .order("dueDate", { ascending: false })

    if (effectiveAssignedUserId) {
      query = query.eq("assignedUserId", effectiveAssignedUserId)
      historyQuery = historyQuery.eq("assignedUserId", effectiveAssignedUserId)
    }

    let usersQuery: any = sb.from("User")
      .select("id, name, commissionRate")
      .eq("companyId", session.user.companyId)
      .eq("isActive", true)
      .eq("role", "ADMIN")
      .order("name", { ascending: true })

    if (!canViewAllUsers) {
      usersQuery = usersQuery.eq("id", session.user.id)
    }

    let expensesQuery: any = sb.from("UserMonthlyExpense")
      .select("*")
      .eq("companyId", session.user.companyId)
      .eq("yearMonth", yearMonth)

    let historyExpensesQuery: any = sb.from("UserMonthlyExpense")
      .select("*")
      .eq("companyId", session.user.companyId)
      .in("yearMonth", fiscalMonthKeys)

    if (effectiveAssignedUserId) {
      expensesQuery = expensesQuery.eq("userId", effectiveAssignedUserId)
      historyExpensesQuery = historyExpensesQuery.eq("userId", effectiveAssignedUserId)
    }

    const [
      { data, error },
      { data: historyRows, error: historyError },
      { data: userRows, error: userError },
      { data: expenses, error: expensesError },
      { data: historyExpenses, error: historyExpensesError },
    ] = await Promise.all([
      query,
      historyQuery,
      usersQuery,
      expensesQuery,
      historyExpensesQuery,
    ])
    if (error) throw new Error(error.message)
    if (historyError) throw new Error(historyError.message)
    if (userError) throw new Error(userError.message)
    if (expensesError) throw new Error(expensesError.message)
    if (historyExpensesError) throw new Error(historyExpensesError.message)

    const expensesByUserId = new Map<string, any>((expenses ?? []).map((expense: any) => [expense.userId, expense]))
    const users = userRows ?? []
    const groups = groupDueInvoices(data ?? [], expensesByUserId, users)
    const totals = buildTotals(groups)

    return NextResponse.json({
      month: yearMonth,
      users: userRows ?? [],
      canViewAllUsers,
      totals,
      groups,
      expenses: expenses ?? [],
      fiscalYear: {
        startMonth: formatYearMonth(fiscalMonths[0]),
        endMonth: formatYearMonth(fiscalMonths[11]),
      },
      history: buildHistory(historyRows ?? [], fiscalMonths, historyExpenses ?? [], users),
    })
  } catch (e: any) {
    console.error("[profit-by-user ERROR]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
