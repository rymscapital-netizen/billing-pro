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
    ADD COLUMN IF NOT EXISTS "officeRentStartDate" TIMESTAMP(3)
  `)

  await client.query(`
    UPDATE "Company"
    SET "officeRentStartDate" = $1
    WHERE type = 'ADMIN'
      AND "officeRentStartDate" IS NULL
  `, ["2026-02-01T00:00:00.000Z"])

  const { rows } = await client.query(`
    SELECT id, name, "officeRent", "officeRentStartDate"
    FROM "Company"
    WHERE type = 'ADMIN'
    ORDER BY "createdAt" ASC
  `)

  console.log("Office rent start migration applied:", rows)
} finally {
  await client.end()
}
