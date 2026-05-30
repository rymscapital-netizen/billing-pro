CREATE TYPE "CommissionMode" AS ENUM ('STANDARD', 'FIXED', 'TRIAL_20');

ALTER TABLE "User"
ADD COLUMN "commissionMode" "CommissionMode" NOT NULL DEFAULT 'STANDARD';

CREATE TABLE "ProjectExpense" (
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
);

CREATE TABLE "CommissionPayout" (
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
);

CREATE INDEX "ProjectExpense_companyId_idx" ON "ProjectExpense"("companyId");
CREATE INDEX "ProjectExpense_invoiceId_idx" ON "ProjectExpense"("invoiceId");
CREATE UNIQUE INDEX "CommissionPayout_userId_yearMonth_key" ON "CommissionPayout"("userId", "yearMonth");
CREATE INDEX "CommissionPayout_companyId_yearMonth_idx" ON "CommissionPayout"("companyId", "yearMonth");
CREATE INDEX "CommissionPayout_companyId_fiscalYearStartMonth_idx" ON "CommissionPayout"("companyId", "fiscalYearStartMonth");

ALTER TABLE "ProjectExpense"
ADD CONSTRAINT "ProjectExpense_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
