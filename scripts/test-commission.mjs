import assert from "node:assert/strict"
import { calculateProjectGrossProfit } from "../src/lib/commission.ts"

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
