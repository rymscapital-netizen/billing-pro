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

await client.connect()

try {
  await client.query(`
    ALTER TABLE "Company"
    ADD COLUMN IF NOT EXISTS "officeRent" DECIMAL(14,0) NOT NULL DEFAULT 0
  `)

  await client.query(`
    ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "employmentStartDate" TIMESTAMP(3)
  `)

  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'Company' AND column_name = 'officeRent') AS company_office_rent,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'employmentStartDate') AS user_employment_start_date
  `)

  console.log("Office rent migration applied:", rows[0])
} finally {
  await client.end()
}
