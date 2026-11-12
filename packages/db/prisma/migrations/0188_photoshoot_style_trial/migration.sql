-- PR 462 (S24, C7.19 "A/B test on-model vs flat-lay on the live site") — the live pilot's own visitor bucketing.
-- Not anticipated by the S00 schema skeleton (unlike StudioPilotRun, already there for this PR's own metrics
-- half); additive only, no existing table changed. "variant" reuses the existing "ProductMediaRole" enum rather
-- than a new one, since it names the same two photo kinds the gallery already knows (ON_MODEL, FLAT_LAY).
-- CreateTable
CREATE TABLE "PhotoshootStyleTrial" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "visitorId" TEXT NOT NULL,
    "variant" "ProductMediaRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoshootStyleTrial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoshootStyleTrial_storeId_productId_visitorId_key" ON "PhotoshootStyleTrial"("storeId", "productId", "visitorId");

-- CreateIndex
CREATE INDEX "PhotoshootStyleTrial_storeId_productId_idx" ON "PhotoshootStyleTrial"("storeId", "productId");

-- AddForeignKey
ALTER TABLE "PhotoshootStyleTrial" ADD CONSTRAINT "PhotoshootStyleTrial_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
