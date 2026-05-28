import "dotenv/config"
import pg from "pg"

const { Client } = pg

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
})

const columns = [
  "defaultBaseSalary",
  "defaultSocialInsurance",
  "defaultEmployeeSocialInsurance",
  "defaultWithholdingTax",
  "defaultTravelExpense",
  "defaultCommunicationCost",
  "defaultWelfareExpense",
  "defaultSuppliesExpense",
]

await client.connect()

try {
  for (const column of columns) {
    await client.query(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "${column}" DECIMAL(14,0) NOT NULL DEFAULT 0
    `)
  }

  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'User'
        AND column_name = ANY($1)
      ORDER BY column_name
    `,
    [columns]
  )

  console.log("User default expenses migration applied:", rows.map(row => row.column_name))
} finally {
  await client.end()
}
