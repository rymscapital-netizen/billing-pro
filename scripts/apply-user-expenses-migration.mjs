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
  CREATE TABLE IF NOT EXISTS "UserMonthlyExpense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "baseSalary" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "socialInsurance" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "rentAllocation" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "paidCommission" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "travelExpense" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "corporateTax" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "communicationCost" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "welfareExpense" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "suppliesExpense" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "otherExpense" DECIMAL(14,0) NOT NULL DEFAULT 0,
    "otherMemo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMonthlyExpense_pkey" PRIMARY KEY ("id")
  )
`)

await client.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS "UserMonthlyExpense_userId_yearMonth_key"
  ON "UserMonthlyExpense"("userId", "yearMonth")
`)

await client.query(`
  CREATE INDEX IF NOT EXISTS "UserMonthlyExpense_companyId_yearMonth_idx"
  ON "UserMonthlyExpense"("companyId", "yearMonth")
`)

await client.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'UserMonthlyExpense_userId_fkey'
    ) THEN
      ALTER TABLE "UserMonthlyExpense"
      ADD CONSTRAINT "UserMonthlyExpense_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'UserMonthlyExpense_companyId_fkey'
    ) THEN
      ALTER TABLE "UserMonthlyExpense"
      ADD CONSTRAINT "UserMonthlyExpense_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
  END $$;
`)

const { rows } = await client.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'UserMonthlyExpense'
  ORDER BY ordinal_position
`)

console.log(JSON.stringify(rows, null, 2))

await client.end()
