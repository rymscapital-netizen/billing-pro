import "dotenv/config"
import { config } from "dotenv"
import pg from "pg"

config({ path: ".env.local" })
config({ path: ".env" })

const { Client } = pg

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

await client.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommissionMode') THEN
    CREATE TYPE "CommissionMode" AS ENUM ('STANDARD', 'TRIAL_20');
  END IF;
END
$$;
`)

await client.query(`
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "commissionMode" "CommissionMode" NOT NULL DEFAULT 'STANDARD'
`)

await client.query(`
CREATE TABLE IF NOT EXISTS "ProjectExpense" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 10,
  "expenseDate" TIMESTAMP(3),
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectExpense_pkey" PRIMARY KEY ("id")
)
`)

await client.query(`
CREATE TABLE IF NOT EXISTS "CommissionPayout" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "yearMonth" TEXT NOT NULL,
  "fiscalYearStartMonth" TEXT NOT NULL,
  "closingDate" TIMESTAMP(3) NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "cumulativeGrossProfit" DECIMAL(14,0) NOT NULL,
  "commissionRate" DECIMAL(5,2) NOT NULL,
  "cumulativeCommissionAmount" DECIMAL(14,0) NOT NULL,
  "priorPaidAmount" DECIMAL(14,0) NOT NULL,
  "payoutAmount" DECIMAL(14,0) NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
)
`)

await client.query(`CREATE INDEX IF NOT EXISTS "ProjectExpense_companyId_idx" ON "ProjectExpense"("companyId")`)
await client.query(`CREATE INDEX IF NOT EXISTS "ProjectExpense_invoiceId_idx" ON "ProjectExpense"("invoiceId")`)
await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissionPayout_userId_yearMonth_key" ON "CommissionPayout"("userId", "yearMonth")`)
await client.query(`CREATE INDEX IF NOT EXISTS "CommissionPayout_companyId_yearMonth_idx" ON "CommissionPayout"("companyId", "yearMonth")`)
await client.query(`CREATE INDEX IF NOT EXISTS "CommissionPayout_companyId_fiscalYearStartMonth_idx" ON "CommissionPayout"("companyId", "fiscalYearStartMonth")`)

await client.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectExpense_invoiceId_fkey') THEN
    ALTER TABLE "ProjectExpense"
    ADD CONSTRAINT "ProjectExpense_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
`)

console.log("Variable commission tables are ready.")

await client.end()
