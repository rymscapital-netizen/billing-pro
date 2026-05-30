import { auth } from "@/lib/auth"
import { calculateProjectGrossProfit } from "@/lib/commission"
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
const CORPORATE_EFFECTIVE_TAX_RATE = 0.3064

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

const userExpenseDefaultMap = {
  baseSalary: "defaultBaseSalary",
  socialInsurance: "defaultSocialInsurance",
  employeeSocialInsurance: "defaultEmployeeSocialInsurance",
  withholdingTax: "defaultWithholdingTax",
  travelExpense: "defaultTravelExpense",
  communicationCost: "defaultCommunicationCost",
  welfareExpense: "defaultWelfareExpense",
  suppliesExpense: "defaultSuppliesExpense",
} as const

const profitUserSelect = "id, name, commissionRate, commissionMode, employmentStartDate, defaultBaseSalary, defaultSocialInsurance, defaultEmployeeSocialInsurance, defaultWithholdingTax, defaultTravelExpense, defaultCommunicationCost, defaultWelfareExpense, defaultSuppliesExpense"

function calculateExpenseTotal(expense: any) {
  return expenseFields.reduce((sum, field) => sum + toNumber(expense?.[field]), 0)
}

function normalizeExpense(expense: any) {
  const normalized: Record<string, any> = {
    id: expense?.id ?? null,
    userId: expense?.userId ?? null,
    yearMonth: expense?.yearMonth ?? null,
    otherMemo: expense?.otherMemo ?? "",
    isAutoRentAllocation: Boolean(expense?.isAutoRentAllocation),
    isAutoDefaultExpense: Boolean(expense?.isAutoDefaultExpense),
  }
  for (const field of expenseFields) normalized[field] = toNumber(expense?.[field])
  for (const field of referenceDeductionFields) normalized[field] = toNumber(expense?.[field])
  normalized.totalExpense = calculateExpenseTotal(expense)
  normalized.totalDeductionReference = referenceDeductionFields.reduce((sum, field) => sum + toNumber(expense?.[field]), 0)
  return normalized
}

function applyCorporateEffectiveTax(expense: any, grossProfit: number) {
  const normalized = normalizeExpense(expense)
  normalized.corporateTax = Math.round(Math.max(grossProfit, 0) * CORPORATE_EFFECTIVE_TAX_RATE)
  normalized.totalExpense = calculateExpenseTotal(normalized)
  return normalized
}

function calculateGrossProfitTarget(expense: any, commissionRate: number) {
  const fixedExpense = Math.max(
    toNumber(expense?.totalExpense) -
      toNumber(expense?.corporateTax),
    0
  )
  const variableRate = CORPORATE_EFFECTIVE_TAX_RATE + Math.max(toNumber(commissionRate), 0) / 100
  const denominator = 1 - variableRate
  const monthlyGrossProfitTarget = fixedExpense > 0 && denominator > 0
    ? Math.ceil(fixedExpense / denominator)
    : 0

  return {
    targetFixedExpense: fixedExpense,
    targetVariableRate: variableRate * 100,
    monthlyGrossProfitTarget,
    annualGrossProfitTarget: monthlyGrossProfitTarget * 12,
  }
}

function monthEndDate(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number)
  return new Date(year, month, 0, 23, 59, 59, 999)
}

function isActiveInMonth(user: any, yearMonth: string) {
  if (!user?.employmentStartDate) return true
  const startDate = new Date(user.employmentStartDate)
  if (Number.isNaN(startDate.getTime())) return true
  return startDate <= monthEndDate(yearMonth)
}

function effectiveOfficeRentForMonth(yearMonth: string, officeRent: number, officeRentStartDate?: string | null) {
  if (officeRent <= 0) return 0
  if (!officeRentStartDate) return officeRent
  const startMonth = formatJstYearMonth(officeRentStartDate)
  return yearMonth >= startMonth ? officeRent : 0
}

function buildRentAllocations(users: any[], yearMonth: string, officeRent: number, officeRentStartDate?: string | null) {
  const allocations = new Map<string, number>()
  const activeUsers = users.filter(user => isActiveInMonth(user, yearMonth))
  const effectiveOfficeRent = effectiveOfficeRentForMonth(yearMonth, officeRent, officeRentStartDate)
  if (effectiveOfficeRent <= 0 || activeUsers.length === 0) return allocations

  const totalRent = Math.round(effectiveOfficeRent)
  const base = Math.floor(totalRent / activeUsers.length)
  const remainder = totalRent - base * activeUsers.length
  activeUsers.forEach((user, index) => {
    allocations.set(user.id, base + (index < remainder ? 1 : 0))
  })
  return allocations
}

function applyOfficeRentToExpenses(expenses: any[], users: any[], yearMonth: string, officeRent: number, officeRentStartDate?: string | null) {
  const byUserId = new Map<string, any>((expenses ?? []).map((expense: any) => [expense.userId, { ...expense }]))
  for (const user of users.filter(user => isActiveInMonth(user, yearMonth))) {
    const current = byUserId.get(user.id) ?? {
      id: null,
      userId: user.id,
      yearMonth,
      otherMemo: "",
      isAutoDefaultExpense: true,
    }
    if (!current.id) {
      for (const [expenseField, userField] of Object.entries(userExpenseDefaultMap)) {
        current[expenseField] = toNumber(user[userField as keyof typeof user])
      }
    }
    byUserId.set(user.id, current)
  }

  const allocations = buildRentAllocations(users, yearMonth, officeRent, officeRentStartDate)

  for (const [userId, rentAllocation] of allocations.entries()) {
    const current = byUserId.get(userId) ?? {
      id: null,
      userId,
      yearMonth,
      otherMemo: "",
    }
    byUserId.set(userId, {
      ...current,
      userId,
      yearMonth,
      rentAllocation,
      isAutoRentAllocation: true,
    })
  }

  return Array.from(byUserId.values())
}

function buildExpensesByUserId(expenses: any[], users: any[], yearMonth: string, officeRent: number, officeRentStartDate?: string | null) {
  return new Map<string, any>(
    applyOfficeRentToExpenses(expenses, users, yearMonth, officeRent, officeRentStartDate).map((expense: any) => [expense.userId, expense])
  )
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

function normalizeInvoiceAssignments(row: any, fallbackAssignedUser: any) {
  const rawAssignments = Array.isArray(row.assignments) ? row.assignments : []
  const assignments = rawAssignments
    .map((assignment: any) => {
      const user = Array.isArray(assignment.user) ? assignment.user[0] : assignment.user
      return {
        userId: assignment.userId ?? user?.id,
        userName: user?.name ?? "未設定",
        commissionRate: toNumber(user?.commissionRate),
        commissionMode: user?.commissionMode ?? "STANDARD",
        shareRate: toNumber(assignment.shareRate),
      }
    })
    .filter((assignment: any) => assignment.userId && assignment.shareRate > 0)

  if (assignments.length > 0) return assignments

  if (fallbackAssignedUser?.id) {
    return [{
      userId: fallbackAssignedUser.id,
      userName: fallbackAssignedUser.name ?? "未設定",
      commissionRate: toNumber(fallbackAssignedUser.commissionRate),
      commissionMode: fallbackAssignedUser.commissionMode ?? "STANDARD",
      shareRate: 100,
    }]
  }

  return [{
    userId: "unassigned",
    userName: "未設定",
    commissionRate: 0,
    commissionMode: "STANDARD",
    shareRate: 100,
  }]
}

function addInvoiceToGroupsByAssignments(
  groups: Map<string, any>,
  row: any,
  options: { basisDate: string | null; confirmedAmount: number; visibleUserId?: string | null }
) {
  const assignedUser = Array.isArray(row.assignedUser) ? row.assignedUser[0] : row.assignedUser
  const company = Array.isArray(row.company) ? row.company[0] : row.company
  const profit = Array.isArray(row.profit) ? row.profit[0] : row.profit
  const assignments = normalizeInvoiceAssignments(row, assignedUser)
  const project = calculateProjectGrossProfit({ ...row, linkedReceivedInvoices: row.linkedReceivedInvoices ?? row.receivedInvoices })
  const sales = project.sales
  const cost = project.cost
  const grossProfit = project.grossProfit
  const amount = toNumber(row.amount)
  const confirmedAmount = options.confirmedAmount

  for (const assignment of assignments) {
    if (options.visibleUserId && assignment.userId !== options.visibleUserId) continue

    const share = assignment.shareRate / 100
    const userId = assignment.userId
    const userName = assignment.userName
    const commissionRate = assignment.commissionMode === "TRIAL_20" ? 20 : assignment.commissionRate
    const assignedSales = sales * share
    const assignedCost = cost * share
    const assignedGrossProfit = grossProfit * share
    const assignedAmount = amount * share
    const assignedConfirmedAmount = confirmedAmount * share
    const commissionAmount = assignedGrossProfit * (commissionRate / 100)
    const subjectSuffix = assignment.shareRate === 100 ? "" : `（${assignment.shareRate}%）`

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

    current.sales += assignedSales
    current.cost += assignedCost
    current.grossProfit += assignedGrossProfit
    current.commissionAmount += commissionAmount
    current.amount += assignedAmount
    current.confirmedAmount += assignedConfirmedAmount
    current.unconfirmedAmount += Math.max(assignedAmount - assignedConfirmedAmount, 0)
    current.invoiceCount += 1
    if (!profit) current.missingProfitCount += 1
    current.items.push({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      companyName: company?.name ?? "未設定",
      subject: `${row.subject}${subjectSuffix}`,
      issueDate: row.issueDate,
      dueDate: row.dueDate,
      paymentDate: options.basisDate,
      sales: assignedSales,
      cost: assignedCost,
      grossProfit: assignedGrossProfit,
      commissionRate,
      commissionAmount,
      amount: assignedAmount,
      status: row.status,
      hasProfit: Boolean(profit),
      shareRate: assignment.shareRate,
    })

    groups.set(userId, current)
  }
}

function applyExpensesToGroups(groups: any[], expensesByUserId: Map<string, any>) {
  return groups.map(group => {
    const expense = applyCorporateEffectiveTax(expensesByUserId.get(group.userId), group.grossProfit)
    const target = calculateGrossProfitTarget(expense, group.commissionRate)
    return {
      ...group,
      expenses: expense,
      totalExpense: expense.totalExpense,
      retainedProfit: group.grossProfit - expense.totalExpense,
      ...target,
    }
  })
}

function addExpenseOnlyGroups(groups: any[], users: any[], expensesByUserId: Map<string, any>) {
  const existingUserIds = new Set(groups.map(group => group.userId))
  const additionalGroups = users
    .filter(user => expensesByUserId.has(user.id) && !existingUserIds.has(user.id))
    .map(user => {
      const expense = applyCorporateEffectiveTax(expensesByUserId.get(user.id), 0)
      const target = calculateGrossProfitTarget(expense, user.commissionRate)
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
        ...target,
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

function groupDueInvoices(
  rows: any[],
  expensesByUserId = new Map<string, any>(),
  users: any[] = [],
  visibleUserId: string | null = null
) {
  const groups = new Map<string, any>()

  for (const row of rows) {
    const payments = Array.isArray(row.payments) ? row.payments : []
    const confirmedAmount = ["PAYMENT_CONFIRMED", "CLEARED"].includes(row.status)
      ? toNumber(row.amount)
      : payments
          .filter((payment: any) => payment.paymentStatus === "CONFIRMED")
          .reduce((sum: number, payment: any) => sum + toNumber(payment.paymentAmount), 0)

    addInvoiceToGroupsByAssignments(groups, row, {
      basisDate: row.dueDate,
      confirmedAmount,
      visibleUserId,
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

function buildHistoryWithRent(
  rows: any[],
  monthStarts: Date[],
  expenses: any[],
  users: any[],
  officeRent: number,
  officeRentStartDate: string | null | undefined,
  visibleUserId: string | null
) {
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
    const monthExpenses = applyOfficeRentToExpenses(expensesByMonth.get(key) ?? [], users, key, officeRent, officeRentStartDate)
      .filter((expense: any) => !visibleUserId || expense.userId === visibleUserId)
    const expensesByUserId = new Map<string, any>(monthExpenses.map((expense: any) => [expense.userId, expense]))
    const totals = buildTotals(groupDueInvoices(rowsByMonth.get(key) ?? [], expensesByUserId, users, visibleUserId))

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

function calculateIncludedTax(totalAmount: unknown) {
  const amount = toNumber(totalAmount)
  if (amount <= 0) return 0
  return amount - Math.round(amount / 1.1)
}

function buildFiscalSummary(params: {
  rows: any[]
  receivedRows: any[]
  expenses: any[]
  users: any[]
  officeRent: number
  officeRentStartDate?: string | null
  monthStarts: Date[]
  selectedYearMonth: string
  visibleUserId: string | null
}) {
  const monthKeys = params.monthStarts
    .map(formatYearMonth)
    .filter(key => key <= params.selectedYearMonth)
  const monthKeySet = new Set(monthKeys)
  const rows = params.rows.filter(row => monthKeySet.has(formatJstYearMonth(row.dueDate)))
  const receivedRows = params.receivedRows.filter(row => monthKeySet.has(formatJstYearMonth(row.dueDate)))
  const expenses = params.expenses.filter(expense => monthKeySet.has(expense.yearMonth))
  const monthly = buildHistoryWithRent(
    rows,
    params.monthStarts.filter(month => monthKeys.includes(formatYearMonth(month))),
    expenses,
    params.users,
    params.officeRent,
    params.officeRentStartDate,
    params.visibleUserId
  )
  const totals = monthly.reduce((sum, row) => ({
    sales: sum.sales + row.sales,
    cost: sum.cost + row.cost,
    grossProfit: sum.grossProfit + row.grossProfit,
    commissionAmount: sum.commissionAmount + row.commissionAmount,
    totalExpense: sum.totalExpense + row.totalExpense,
    retainedProfit: sum.retainedProfit + row.retainedProfit,
    invoiceCount: sum.invoiceCount + row.invoiceCount,
    missingProfitCount: sum.missingProfitCount + row.missingProfitCount,
  }), {
    sales: 0,
    cost: 0,
    grossProfit: 0,
    commissionAmount: 0,
    totalExpense: 0,
    retainedProfit: 0,
    invoiceCount: 0,
    missingProfitCount: 0,
  })
  const salesTax = rows.reduce((sum, row) => sum + toNumber(row.tax), 0)
  const purchaseTax = receivedRows.reduce((sum, row) => sum + calculateIncludedTax(row.amount), 0)

  return {
    startMonth: monthKeys[0] ?? params.selectedYearMonth,
    endMonth: monthKeys[monthKeys.length - 1] ?? params.selectedYearMonth,
    sales: totals.sales,
    cost: totals.cost,
    grossProfit: totals.grossProfit,
    totalExpense: totals.totalExpense,
    retainedProfit: totals.retainedProfit,
    commissionAmount: totals.commissionAmount,
    salesTax,
    purchaseTax,
    consumptionTaxBalance: salesTax - purchaseTax,
    invoiceCount: totals.invoiceCount,
    missingProfitCount: totals.missingProfitCount,
    profitRate: totals.sales > 0 ? (totals.grossProfit / totals.sales) * 100 : 0,
  }
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
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, tax, status, assignedUserId, assignedUser:User!assignedUserId(id, name, commissionRate, commissionMode, employmentStartDate), assignments:InvoiceAssignment(*, user:User!userId(id, name, commissionRate, commissionMode, employmentStartDate)), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*), projectExpenses:ProjectExpense(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .neq("status", "DRAFT")
      .gte("dueDate", start)
      .lt("dueDate", endExclusive)
      .order("dueDate", { ascending: false })

    let historyQuery: any = sb.from("Invoice")
      .select("id, invoiceNumber, subject, issueDate, dueDate, amount, subtotal, tax, status, assignedUserId, assignedUser:User!assignedUserId(id, name, commissionRate, commissionMode, employmentStartDate), assignments:InvoiceAssignment(*, user:User!userId(id, name, commissionRate, commissionMode, employmentStartDate)), company:Company!companyId(id, name), profit:InvoiceProfit(*), payments:InvoicePayment(*), projectExpenses:ProjectExpense(*)")
      .eq("issuerCompanyId", session.user.companyId)
      .neq("status", "DRAFT")
      .gte("dueDate", fiscalStart)
      .lt("dueDate", fiscalEndExclusive)
      .order("dueDate", { ascending: false })

    let usersQuery: any = sb.from("User")
      .select(profitUserSelect)
      .eq("companyId", session.user.companyId)
      .eq("isActive", true)
      .eq("role", "ADMIN")
      .order("name", { ascending: true })

    const rentUsersQuery = sb.from("User")
      .select(profitUserSelect)
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

    let receivedTaxQuery: any = sb.from("ReceivedInvoice")
      .select("id, amount, dueDate, assignedUserId")
      .eq("ownerCompanyId", session.user.companyId)
      .gte("dueDate", fiscalStart)
      .lt("dueDate", fiscalEndExclusive)

    if (effectiveAssignedUserId) {
      receivedTaxQuery = receivedTaxQuery.eq("assignedUserId", effectiveAssignedUserId)
    }

    const [
      { data, error },
      { data: historyRows, error: historyError },
      { data: userRows, error: userError },
      { data: rentUserRows, error: rentUserError },
      { data: expenses, error: expensesError },
      { data: historyExpenses, error: historyExpensesError },
      { data: companySettings, error: companySettingsError },
      { data: receivedTaxRows, error: receivedTaxError },
    ] = await Promise.all([
      query,
      historyQuery,
      usersQuery,
      rentUsersQuery,
      expensesQuery,
      historyExpensesQuery,
      sb.from("Company").select("officeRent, officeRentStartDate").eq("id", session.user.companyId).maybeSingle(),
      receivedTaxQuery,
    ])
    if (error) throw new Error(error.message)
    if (historyError) throw new Error(historyError.message)
    if (userError) throw new Error(userError.message)
    if (rentUserError) throw new Error(rentUserError.message)
    if (expensesError) throw new Error(expensesError.message)
    if (historyExpensesError) throw new Error(historyExpensesError.message)
    if (companySettingsError) throw new Error(companySettingsError.message)
    if (receivedTaxError) throw new Error(receivedTaxError.message)

    const users = userRows ?? []
    const rentUsers = rentUserRows ?? users
    const officeRent = toNumber(companySettings?.officeRent)
    const officeRentStartDate = companySettings?.officeRentStartDate ?? null
    const effectiveOfficeRent = effectiveOfficeRentForMonth(yearMonth, officeRent, officeRentStartDate)
    const currentExpenses = applyOfficeRentToExpenses(expenses ?? [], rentUsers, yearMonth, officeRent, officeRentStartDate)
      .filter((expense: any) => !effectiveAssignedUserId || expense.userId === effectiveAssignedUserId)
    const expensesByUserId = new Map<string, any>(currentExpenses.map((expense: any) => [expense.userId, expense]))
    const groups = groupDueInvoices(data ?? [], expensesByUserId, users, effectiveAssignedUserId)
    const totals = buildTotals(groups)
    const groupExpenses = groups.map(group => group.expenses).filter(Boolean)
    const history = buildHistoryWithRent(historyRows ?? [], fiscalMonths, historyExpenses ?? [], rentUsers, officeRent, officeRentStartDate, effectiveAssignedUserId)
    const fiscalSummary = buildFiscalSummary({
      rows: historyRows ?? [],
      receivedRows: receivedTaxRows ?? [],
      expenses: historyExpenses ?? [],
      users: rentUsers,
      officeRent,
      officeRentStartDate,
      monthStarts: fiscalMonths,
      selectedYearMonth: yearMonth,
      visibleUserId: effectiveAssignedUserId,
    })

    return NextResponse.json({
      month: yearMonth,
      users: userRows ?? [],
      canViewAllUsers,
      totals,
      groups,
      expenses: groupExpenses,
      officeRent,
      officeRentStartDate,
      effectiveOfficeRent,
      fiscalYear: {
        startMonth: formatYearMonth(fiscalMonths[0]),
        endMonth: formatYearMonth(fiscalMonths[11]),
      },
      fiscalSummary,
      history,
    })
  } catch (e: any) {
    console.error("[profit-by-user ERROR]", e?.message ?? e)
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
