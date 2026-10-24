-- PR 98 (S03, with PR 100): "Build your own set". One new table only: each built set put into a bag, by the tap's key,
-- so the same tap sent twice is the same add (a double tap or a resent request never puts the pieces in twice), with
-- the set tier rule it was built in and its pieces, for the report. The pieces themselves go into the bag as ordinary
-- CartItem lines, priced by the Smart Rules set tiers; no existing table or column is changed and nothing is dropped.

-- CreateTable
CREATE TABLE "SetBuilderAdd" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "cartId" UUID NOT NULL,
    "addKey" TEXT NOT NULL,
    "ruleId" UUID NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "variantIds" UUID[],
    "pieces" INTEGER NOT NULL,
    "regularMinor" INTEGER NOT NULL,
    "payMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetBuilderAdd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SetBuilderAdd_storeId_createdAt_idx" ON "SetBuilderAdd"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SetBuilderAdd_cartId_addKey_key" ON "SetBuilderAdd"("cartId", "addKey");

-- AddForeignKey
ALTER TABLE "SetBuilderAdd" ADD CONSTRAINT "SetBuilderAdd_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

