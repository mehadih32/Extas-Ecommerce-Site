-- PR 502 (follow-up 417): a record of each merge of a place — what it added to the place that stays, the places and the
-- saved customer addresses it moved, and the owner's list rows it changed — so the owner can undo a merge. Only adds a
-- table; nothing is changed, renamed or dropped. Merges made before it have no record (they stay as they are).
-- CreateTable
CREATE TABLE "GeoMergeRecord" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "fromId" UUID NOT NULL,
    "intoId" UUID NOT NULL,
    "addedAliases" TEXT[],
    "addedPostcodes" TEXT[],
    "children" JSONB NOT NULL,
    "addressIds" UUID[],
    "bands" JSONB NOT NULL,
    "actorId" UUID,
    "mergedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMPTZ(3),
    "undoneById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GeoMergeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoMergeRecord_fromId_mergedAt_idx" ON "GeoMergeRecord"("fromId", "mergedAt");

-- CreateIndex
CREATE INDEX "GeoMergeRecord_intoId_mergedAt_idx" ON "GeoMergeRecord"("intoId", "mergedAt");

-- AddForeignKey
ALTER TABLE "GeoMergeRecord" ADD CONSTRAINT "GeoMergeRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
