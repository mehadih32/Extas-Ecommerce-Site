-- PR 182 (S08; Blueprint B1.3, CN-014c, SIM-F-010, follow-up 434): the packing step of Orders > Packing & print.
-- PackingScan keeps each piece checked at the packing table (scanned, typed when the scanner is off, or ticked) against
-- its order line; PackingPhoto keeps the packing proof photos with the day each is kept until (archived after, never
-- deleted); PackingCheck keeps an order's scale reading against its pieces' weights, a big gap the packer confirmed, and
-- the owner's override of a required photo with its reason.
-- Everything here only adds; no column is changed, renamed or dropped; nothing is deleted.

-- CreateTable
CREATE TABLE "PackingScan" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "scannedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackingScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingPhoto" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "takenById" UUID,
    "keepUntil" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PackingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingCheck" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "weighedGrams" INTEGER,
    "expectedGrams" INTEGER,
    "weighedById" UUID,
    "weighedAt" TIMESTAMPTZ(3),
    "weightGapConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "photoWaivedReason" TEXT,
    "photoWaivedById" UUID,
    "photoWaivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PackingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackingScan_storeId_orderId_idx" ON "PackingScan"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "PackingPhoto_storeId_orderId_idx" ON "PackingPhoto"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "PackingPhoto_storeId_keepUntil_idx" ON "PackingPhoto"("storeId", "keepUntil");

-- CreateIndex
CREATE UNIQUE INDEX "PackingCheck_storeId_orderId_key" ON "PackingCheck"("storeId", "orderId");

-- AddForeignKey
ALTER TABLE "PackingScan" ADD CONSTRAINT "PackingScan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingPhoto" ADD CONSTRAINT "PackingPhoto_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingCheck" ADD CONSTRAINT "PackingCheck_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PackingScan (PR 182): every piece checked at the packing table; a wrong scan is refused, never stored or edited.
REVOKE UPDATE, DELETE, TRUNCATE ON "PackingScan" FROM extas_app;
CREATE TRIGGER "PackingScan_append_only" BEFORE UPDATE OR DELETE ON "PackingScan" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "PackingScan_no_truncate" BEFORE TRUNCATE ON "PackingScan" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
