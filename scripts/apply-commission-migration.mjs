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
  ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "commissionRate" DECIMAL(5, 2) NOT NULL DEFAULT 0
`)

await client.query(
  `UPDATE "User" SET "commissionRate" = 10 WHERE name LIKE $1 AND role = $2`,
  ["%\u5165\u5185\u5d8b%", "ADMIN"]
)

await client.query(
  `UPDATE "User" SET "commissionRate" = 0 WHERE name LIKE $1 AND role = $2`,
  ["%\u6d6a\u7530%", "ADMIN"]
)

const { rows } = await client.query(
  `SELECT id, name, role, "commissionRate" FROM "User" WHERE role = $1 ORDER BY name`,
  ["ADMIN"]
)

console.log(JSON.stringify(rows, null, 2))

await client.end()
