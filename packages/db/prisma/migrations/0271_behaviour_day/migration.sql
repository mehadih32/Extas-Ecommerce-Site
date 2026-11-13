-- PR 701 (S28; admin prototype v5, Website -> Analytics -> Behaviour): counted behaviour on pages (clicks by grid cell, scroll depth, checkout boxes touched and left empty), never one visitor's trail, never a typed value. One new table, nothing else is changed, dropped or rewritten.

-- CreateTable
CREATE TABLE "BehaviourDay" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BehaviourDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BehaviourDay_storeId_day_kind_idx" ON "BehaviourDay"("storeId", "day", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BehaviourDay_storeId_day_kind_pageType_device_key_key" ON "BehaviourDay"("storeId", "day", "kind", "pageType", "device", "key");

-- AddForeignKey
ALTER TABLE "BehaviourDay" ADD CONSTRAINT "BehaviourDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

