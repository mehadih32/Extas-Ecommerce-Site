-- PR 688 (S28, admin prototype v5) — monthly budgets per cost head, append-only versions. Additive only; ships empty.

-- CreateTable
CREATE TABLE "CostBudget" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "headKey" TEXT NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostBudget_storeId_headKey_fromMonth_idx" ON "CostBudget"("storeId", "headKey", "fromMonth");

-- AddForeignKey
ALTER TABLE "CostBudget" ADD CONSTRAINT "CostBudget_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
