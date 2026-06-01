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
ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "annualGrossProfitTarget" DECIMAL(14,0) NOT NULL DEFAULT 0
`)

await client.query(`
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "targetGrossProfitShare" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "targetCommissionAmount" DECIMAL(14,0) NOT NULL DEFAULT 0
`)

console.log("Profit target columns are ready.")

await client.end()
