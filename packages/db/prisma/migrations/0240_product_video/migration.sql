-- PR 681 (S28 Admin v5) — a product's video (a link or an uploaded file). Additive only: a new table and enum; nothing is
-- dropped or renamed.
-- CreateEnum
CREATE TYPE "VideoSource" AS ENUM ('LINK', 'FILE');

-- CreateTable
CREATE TABLE "ProductVideo" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "source" "VideoSource" NOT NULL,
    "provider" TEXT NOT NULL,
    "url" TEXT,
    "embedId" TEXT,
    "fileAssetId" UUID,
    "posterAssetId" UUID,
    "durationSec" INTEGER,
    "titleEn" TEXT,
    "titleBn" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVideo_storeId_productId_archivedAt_idx" ON "ProductVideo"("storeId", "productId", "archivedAt");

-- AddForeignKey
ALTER TABLE "ProductVideo" ADD CONSTRAINT "ProductVideo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
