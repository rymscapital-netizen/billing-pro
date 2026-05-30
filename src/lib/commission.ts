export const COMMISSION_TIERS = [
  { min: 0, rate: 10 },
  { min: 15_000_000, rate: 15 },
  { min: 20_000_000, rate: 20 },
  { min: 25_000_000, rate: 25 },
  { min: 30_000_000, rate: 30 },
] as const

export type CommissionMode = "STANDARD" | "TRIAL_20"

export function resolveFiscalYearStartMonth(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number)
  const startYear = month >= 6 ? year : year - 1
  return `${startYear}-06`
}

export function resolveFiscalRange(yearMonth: string) {
  const fiscalYearStartMonth = resolveFiscalYearStartMonth(yearMonth)
  const [startYear] = fiscalYearStartMonth.split("-").map(Number)
  return {
    fiscalYearStartMonth,
    start: `${startYear}-06-01T00:00:00`,
    endExclusive: `${startYear + 1}-06-01T00:00:00`,
  }
}

export function resolveMonthRange(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number)
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    endExclusive: `${next.year}-${String(next.month).padStart(2, "0")}-01T00:00:00`,
  }
}

export function resolvePaymentDate(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number)
  const pay = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return `${pay.year}-${String(pay.month).padStart(2, "0")}-10T00:00:00`
}

export function resolveCommissionRate(cumulativeGrossProfit: number, mode: CommissionMode = "STANDARD") {
  if (mode === "TRIAL_20") return 20
  return COMMISSION_TIERS.reduce((rate, tier) => (
    cumulativeGrossProfit >= tier.min ? tier.rate : rate
  ), COMMISSION_TIERS[0].rate)
}

export function taxExcludedFromIncluded(amount: unknown, taxRate: unknown = 10) {
  const total = Number(amount ?? 0)
  const rate = Number(taxRate ?? 10)
  if (total <= 0) return 0
  return Math.round(total / (1 + Math.max(rate, 0) / 100))
}

export function calculateProjectGrossProfit(row: any) {
  const profit = Array.isArray(row.profit) ? row.profit[0] : row.profit
  const receivedInvoices = Array.isArray(row.linkedReceivedInvoices)
    ? row.linkedReceivedInvoices
    : Array.isArray(row.receivedInvoices)
      ? row.receivedInvoices
      : []
  const projectExpenses = Array.isArray(row.projectExpenses) ? row.projectExpenses : []
  const sales = profit ? Number(profit.sales ?? 0) : Number(row.subtotal ?? 0)
  const receivedCost = receivedInvoices.reduce(
    (sum: number, invoice: any) => sum + taxExcludedFromIncluded(invoice.amount, 10),
    0
  )
  const extraCost = projectExpenses.reduce(
    (sum: number, expense: any) => sum + taxExcludedFromIncluded(expense.amount, expense.taxRate),
    0
  )
  const manualCost = profit ? Math.max(Number(profit.cost ?? 0) - receivedCost, 0) : 0
  const cost = receivedCost + extraCost + manualCost
  return {
    sales,
    receivedCost,
    extraCost,
    manualCost,
    cost,
    grossProfit: sales - cost,
  }
}
