CREATE TABLE IF NOT EXISTS "ManualProfit" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "yearMonth" TEXT NOT NULL,
  "profitDate" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL,
  "amount" DECIMAL(14,0) NOT NULL,
  "memo" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManualProfit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ManualProfit_companyId_yearMonth_idx" ON "ManualProfit"("companyId", "yearMonth");
CREATE INDEX IF NOT EXISTS "ManualProfit_userId_yearMonth_idx" ON "ManualProfit"("userId", "yearMonth");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ManualProfit_userId_fkey'
  ) THEN
    ALTER TABLE "ManualProfit"
      ADD CONSTRAINT "ManualProfit_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
