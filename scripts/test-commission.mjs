import assert from "node:assert/strict"
import { calculateInvoiceProfit, calculateIruchijimaCommissionableGrossProfit, calculateProjectGrossProfit } from "../src/lib/commission.ts"

assert.deepEqual(calculateInvoiceProfit(90_910, 64_718), {
  sales: 90_910,
  cost: 64_718,
  grossProfit: 26_192,
  profitRate: (26_192 / 90_910) * 100,
})

const oneYenMismatch = calculateProjectGrossProfit({
  subtotal: 90_910,
  profit: { sales: 90_909, cost: 64_718 },
})

assert.equal(oneYenMismatch.sales, 90_910)
assert.equal(oneYenMismatch.grossProfit, 26_192)

const fukuoka = calculateProjectGrossProfit({
  subtotal: 90_909,
  profit: { sales: 90_909, cost: 64_718 },
  projectExpenses: [{ amount: 71_190, taxRate: 10 }],
})

assert.deepEqual(fukuoka, {
  sales: 90_909,
  receivedCost: 0,
  extraCost: 64_718,
  manualCost: 0,
  cost: 64_718,
  grossProfit: 26_191,
})

const mixedCosts = calculateProjectGrossProfit({
  profit: { sales: 200_000, cost: 100_000 },
  linkedReceivedInvoices: [{ amount: 55_000 }],
  projectExpenses: [{ amount: 33_000, taxRate: 10 }],
})

assert.deepEqual(mixedCosts, {
  sales: 200_000,
  receivedCost: 50_000,
  extraCost: 30_000,
  manualCost: 20_000,
  cost: 100_000,
  grossProfit: 100_000,
})

console.log("commission calculation tests passed")

const iruchijima = calculateIruchijimaCommissionableGrossProfit([
  { yearMonth: "2026-08", grossProfit: 150_000 },
  { yearMonth: "2026-09", grossProfit: 300_000 },
  { yearMonth: "2026-10", grossProfit: 250_000 },
])
assert.equal(iruchijima.months[0].carriedDeficit, 40_000)
assert.equal(iruchijima.months[1].commissionableGrossProfit, 70_000)
assert.equal(iruchijima.months[2].commissionableGrossProfit, 60_000)
assert.equal(iruchijima.cumulativeCommissionableGrossProfit, 130_000)

const iruchijimaWithEmptyMonth = calculateIruchijimaCommissionableGrossProfit([
  { yearMonth: "2027-06", grossProfit: 0 },
  { yearMonth: "2027-07", grossProfit: 400_000 },
])
assert.equal(iruchijimaWithEmptyMonth.months[0].carriedDeficit, 190_000)
assert.equal(iruchijimaWithEmptyMonth.months[1].commissionableGrossProfit, 20_000)
