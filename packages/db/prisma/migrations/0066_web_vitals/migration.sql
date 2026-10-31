-- PR 234 (S11, CN-031 lane A): real visitors' Core Web Vitals (LCP, CLS, INP, TTFB, FCP) kept as one row per day, metric,
-- kind of page and device, holding how many readings fell in each bucket, so the 75th percentile can be read for any
-- span of days. Never a visitor, an address or a time of day. A row only grows; the app may not delete or empty it.
-- The monthly lab measurement goes to the existing SpeedMeasurement history. Everything here only adds; nothing is
-- changed, renamed or dropped. Migration number 0066 (lane A had 0059; renumbered at the batch 3 merge to sort after the applied 0064).

-- CreateTable
CREATE TABLE "WebVitalDay" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "metric" TEXT NOT NULL,
    "pageKind" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "buckets" INTEGER[],
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebVitalDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebVitalDay_storeId_day_idx" ON "WebVitalDay"("storeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "WebVitalDay_storeId_day_metric_pageKind_device_key" ON "WebVitalDay"("storeId", "day", "metric", "pageKind", "device");

-- AddForeignKey
ALTER TABLE "WebVitalDay" ADD CONSTRAINT "WebVitalDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: the counts only grow (nothing is deleted).
REVOKE DELETE, TRUNCATE ON "WebVitalDay" FROM extas_app;
