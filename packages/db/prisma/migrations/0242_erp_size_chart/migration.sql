-- S28 · PR 683 — size charts the ERP sends per style (inbound). Additive only: a new table; nothing is dropped or renamed.
-- CreateTable
CREATE TABLE "ErpSizeChart" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "erpStyleCode" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "versionHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedSizeChartId" UUID,
    "appliedHash" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpSizeChart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpSizeChart_storeId_erpStyleCode_key" ON "ErpSizeChart"("storeId", "erpStyleCode");

-- AddForeignKey
ALTER TABLE "ErpSizeChart" ADD CONSTRAINT "ErpSizeChart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
