CREATE TABLE "InvoiceAssignment" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shareRate" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoiceAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceAssignment_invoiceId_userId_key" ON "InvoiceAssignment"("invoiceId", "userId");
CREATE INDEX "InvoiceAssignment_userId_idx" ON "InvoiceAssignment"("userId");

ALTER TABLE "InvoiceAssignment"
ADD CONSTRAINT "InvoiceAssignment_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceAssignment"
ADD CONSTRAINT "InvoiceAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "InvoiceAssignment" ("id", "invoiceId", "userId", "shareRate", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "assignedUserId", 100, NOW(), NOW()
FROM "Invoice"
WHERE "assignedUserId" IS NOT NULL
ON CONFLICT ("invoiceId", "userId") DO NOTHING;
