-- PR 592 (S12) — the journal's house ads (`blog.houseAds`, off as shipped): each ad's own words in both languages, a
-- place set aside instead of deleted, each place's day of clicks, and each order's credit to the house ad click before
-- it. The indexes the House ads page and the journal pages read with. Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "HouseAd" ADD COLUMN     "ctaBn" TEXT,
ADD COLUMN     "ctaEn" TEXT,
ADD COLUMN     "headlineBn" TEXT,
ADD COLUMN     "headlineEn" TEXT,
ADD COLUMN     "textBn" TEXT,
ADD COLUMN     "textEn" TEXT;

-- AlterTable
ALTER TABLE "HouseAdPlacement" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "HouseAdDailyStat" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "placementId" UUID NOT NULL,
    "adId" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HouseAdDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseAdOrderClick" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "adId" UUID NOT NULL,
    "placementId" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "clickedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseAdOrderClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseAdDailyStat_storeId_day_idx" ON "HouseAdDailyStat"("storeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "HouseAdDailyStat_placementId_day_key" ON "HouseAdDailyStat"("placementId", "day");

-- CreateIndex
CREATE INDEX "HouseAdOrderClick_storeId_placementId_idx" ON "HouseAdOrderClick"("storeId", "placementId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseAdOrderClick_orderId_key" ON "HouseAdOrderClick"("orderId");

-- CreateIndex
CREATE INDEX "HouseAd_storeId_enabled_idx" ON "HouseAd"("storeId", "enabled");

-- CreateIndex
CREATE INDEX "HouseAdPlacement_storeId_slot_enabled_idx" ON "HouseAdPlacement"("storeId", "slot", "enabled");

-- CreateIndex
CREATE INDEX "HouseAdPlacement_adId_idx" ON "HouseAdPlacement"("adId");

-- AddForeignKey
ALTER TABLE "HouseAdDailyStat" ADD CONSTRAINT "HouseAdDailyStat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseAdOrderClick" ADD CONSTRAINT "HouseAdOrderClick_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- HouseAdOrderClick is @append-only (an order's credit to the ad click before it is written once): locked at the database (PR 139).
REVOKE UPDATE, DELETE, TRUNCATE ON "HouseAdOrderClick" FROM extas_app;
CREATE TRIGGER "HouseAdOrderClick_append_only" BEFORE UPDATE OR DELETE ON "HouseAdOrderClick" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "HouseAdOrderClick_no_truncate" BEFORE TRUNCATE ON "HouseAdOrderClick" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
