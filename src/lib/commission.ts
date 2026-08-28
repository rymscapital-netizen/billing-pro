export const COMMISSION_TIERS = [
  { min: 0, rate: 10 },
  { min: 15_000_000, rate: 15 },
  { min: 20_000_000, rate: 20 },
  { min: 25_000_000, rate: 25 },
  { min: 30_000_000, rate: 30 },
] as const

export type CommissionMode = "STANDARD" | "FIXED" | "TRIAL_20"

export const IRUCHIJIMA_COMMISSION_USER_NAME = "入内嶋博"
export const IRUCHIJIMA_COMMISSION_START_MONTH = "2026-08"
export const IRUCHIJIMA_MONTHLY_GROSS_PROFIT_BASE = 190_000

export function calculateIruchijimaCommissionableGrossProfit(
  monthlyGrossProfits: { yearMonth: string; grossProfit: number }[]
) {
  let carriedDeficit = 0
  let cumulativeCommissionableGrossProfit = 0

  const months = [...monthlyGrossProfits]
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    .map(row => {
      const grossProfit = Number(row.grossProfit ?? 0)
      if (row.yearMonth < IRUCHIJIMA_COMMISSION_START_MONTH) {
        cumulativeCommissionableGrossProfit += grossProfit
        return { ...row, grossProfit, commissionableGrossProfit: grossProfit, carriedDeficit }
      }

      const balance = grossProfit - IRUCHIJIMA_MONTHLY_GROSS_PROFIT_BASE - carriedDeficit
      const commissionableGrossProfit = Math.max(balance, 0)
      carriedDeficit = Math.max(-balance, 0)
      cumulativeCommissionableGrossProfit += commissionableGrossProfit
      return { ...row, grossProfit, commissionableGrossProfit, carriedDeficit }
    })

  return { months, carriedDeficit, cumulativeCommissionableGrossProfit }
}

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

export function resolveCommissionRate(cumulativeGrossProfit: number, mode: CommissionMode = "STANDARD", fixedRate = 0) {
  if (mode === "TRIAL_20") return 20
  if (mode === "FIXED") return Math.max(Number(fixedRate ?? 0), 0)
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

export function calculateInvoiceProfit(salesValue: unknown, costValue: unknown) {
  const sales = Number(salesValue ?? 0)
  const cost = Number(costValue ?? 0)
  const grossProfit = sales - cost
  return {
    sales,
    cost,
    grossProfit,
    profitRate: sales > 0 ? (grossProfit / sales) * 100 : 0,
  }
}

export function calculateProjectGrossProfit(row: any) {
  const profit = Array.isArray(row.profit) ? row.profit[0] : row.profit
  const receivedInvoices = Array.isArray(row.linkedReceivedInvoices)
    ? row.linkedReceivedInvoices
    : Array.isArray(row.receivedInvoices)
      ? row.receivedInvoices
      : []
  const projectExpenses = Array.isArray(row.projectExpenses) ? row.projectExpenses : []
  const sales = row.subtotal != null
    ? Number(row.subtotal)
    : profit
      ? Number(profit.sales ?? 0)
      : 0
  const receivedCost = receivedInvoices.reduce(
    (sum: number, invoice: any) => sum + taxExcludedFromIncluded(invoice.amount, 10),
    0
  )
  const extraCost = projectExpenses.reduce(
    (sum: number, expense: any) => sum + taxExcludedFromIncluded(expense.amount, expense.taxRate),
    0
  )
  const trackedCost = receivedCost + extraCost
  // InvoiceProfit.cost is synchronized with linked invoices and project expenses.
  // Only the part above those tracked costs can be treated as a manual cost;
  // otherwise the same project expense is counted once from each source.
  const manualCost = profit ? Math.max(Number(profit.cost ?? 0) - trackedCost, 0) : 0
  const cost = trackedCost + manualCost
  return {
    sales,
    receivedCost,
    extraCost,
    manualCost,
    cost,
    grossProfit: sales - cost,
  }
}
