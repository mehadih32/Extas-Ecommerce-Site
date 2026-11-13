-- PR 689 (S28, admin prototype v5) — saved report views (period, compare and filters under the owner's name). Additive only.

-- CreateTable
CREATE TABLE "ReportView" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "reportKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReportView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportView_storeId_reportKey_idx" ON "ReportView"("storeId", "reportKey");

-- AddForeignKey
ALTER TABLE "ReportView" ADD CONSTRAINT "ReportView_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
