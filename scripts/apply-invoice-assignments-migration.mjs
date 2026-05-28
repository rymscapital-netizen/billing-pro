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
    CREATE TABLE IF NOT EXISTS "InvoiceAssignment" (
      "id" TEXT NOT NULL,
      "invoiceId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "shareRate" DECIMAL(5,2) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "InvoiceAssignment_pkey" PRIMARY KEY ("id")
    )
  `)
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceAssignment_invoiceId_userId_key" ON "InvoiceAssignment"("invoiceId", "userId")`)
  await client.query(`CREATE INDEX IF NOT EXISTS "InvoiceAssignment_userId_idx" ON "InvoiceAssignment"("userId")`)
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceAssignment_invoiceId_fkey'
      ) THEN
        ALTER TABLE "InvoiceAssignment"
        ADD CONSTRAINT "InvoiceAssignment_invoiceId_fkey"
        FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'InvoiceAssignment_userId_fkey'
      ) THEN
        ALTER TABLE "InvoiceAssignment"
        ADD CONSTRAINT "InvoiceAssignment_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$;
  `)
  await client.query(`
    INSERT INTO "InvoiceAssignment" ("id", "invoiceId", "userId", "shareRate", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, "id", "assignedUserId", 100, NOW(), NOW()
    FROM "Invoice"
    WHERE "assignedUserId" IS NOT NULL
    ON CONFLICT ("invoiceId", "userId") DO NOTHING
  `)

  const { rows } = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "InvoiceAssignment"
  `)
  console.log("Invoice assignment migration applied:", rows[0])
} finally {
  await client.end()
}
