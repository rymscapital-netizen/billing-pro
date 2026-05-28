CREATE TABLE "UserMonthlyExpense" (
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
);

CREATE UNIQUE INDEX "UserMonthlyExpense_userId_yearMonth_key" ON "UserMonthlyExpense"("userId", "yearMonth");
CREATE INDEX "UserMonthlyExpense_companyId_yearMonth_idx" ON "UserMonthlyExpense"("companyId", "yearMonth");

ALTER TABLE "UserMonthlyExpense" ADD CONSTRAINT "UserMonthlyExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserMonthlyExpense" ADD CONSTRAINT "UserMonthlyExpense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
