-- PR 665 (S28 wave 1): the merge record. One row per order folded into another ("Merge" on a Merge-needed row); additive, append-only.

-- CreateTable
CREATE TABLE "OrderMerge" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "mainOrderId" UUID NOT NULL,
    "sourceOrderId" UUID NOT NULL,
    "movedLines" INTEGER NOT NULL,
    "movedMinor" INTEGER NOT NULL,
    "leftOutLines" INTEGER NOT NULL,
    "addressDiffered" BOOLEAN NOT NULL DEFAULT false,
    "callQueued" BOOLEAN NOT NULL DEFAULT false,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "mergedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderMerge_sourceOrderId_key" ON "OrderMerge"("sourceOrderId");

-- CreateIndex
CREATE INDEX "OrderMerge_storeId_mainOrderId_idx" ON "OrderMerge"("storeId", "mainOrderId");

-- CreateIndex
CREATE INDEX "OrderMerge_storeId_createdAt_idx" ON "OrderMerge"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderMerge" ADD CONSTRAINT "OrderMerge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMerge" ADD CONSTRAINT "OrderMerge_mainOrderId_fkey" FOREIGN KEY ("mainOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMerge" ADD CONSTRAINT "OrderMerge_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- OrderMerge is @append-only (a record of what was folded into what): locked at the database (PR 139).
REVOKE UPDATE, DELETE, TRUNCATE ON "OrderMerge" FROM extas_app;
CREATE TRIGGER "OrderMerge_append_only" BEFORE UPDATE OR DELETE ON "OrderMerge" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "OrderMerge_no_truncate" BEFORE TRUNCATE ON "OrderMerge" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
