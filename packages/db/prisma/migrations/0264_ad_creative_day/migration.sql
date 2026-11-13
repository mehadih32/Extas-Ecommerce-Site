-- PR 699 (S28, CN-048) — Marketing › Ad campaigns: one ad's day. Additive only; nothing is dropped or renamed.
-- CreateTable
CREATE TABLE "AdCreativeDay" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "spendStoreMinor" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdCreativeDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdCreativeDay_adId_date_key" ON "AdCreativeDay"("adId", "date");

-- CreateIndex
CREATE INDEX "AdCreativeDay_storeId_date_idx" ON "AdCreativeDay"("storeId", "date");

-- AddForeignKey
ALTER TABLE "AdCreativeDay" ADD CONSTRAINT "AdCreativeDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreativeDay" ADD CONSTRAINT "AdCreativeDay_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
