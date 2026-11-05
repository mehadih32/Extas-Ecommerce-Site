-- PR 535: legacy customer import — the import's file name, choices and counts, its undo (archive, never delete), and
-- the old shop's orders as history-only records (never an Order: no stock, no money, nothing sent).
ALTER TABLE "LegacyImport" ADD COLUMN "fileName" TEXT;
ALTER TABLE "LegacyImport" ADD COLUMN "summary" JSONB;
ALTER TABLE "LegacyImport" ADD COLUMN "undoneAt" TIMESTAMPTZ(3);
ALTER TABLE "LegacyImport" ADD COLUMN "undoneById" UUID;

CREATE INDEX "LegacyImport_storeId_createdAt_idx" ON "LegacyImport"("storeId", "createdAt");

CREATE TABLE "LegacyOrderRecord" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "importId" UUID NOT NULL,
    "customerId" UUID,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "ref" TEXT,
    "orderedAt" TIMESTAMPTZ(3),
    "totalMinor" INTEGER,
    "statusText" TEXT,
    "outcome" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LegacyOrderRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LegacyOrderRecord_storeId_phone_idx" ON "LegacyOrderRecord"("storeId", "phone");
CREATE INDEX "LegacyOrderRecord_storeId_fingerprint_idx" ON "LegacyOrderRecord"("storeId", "fingerprint");
CREATE INDEX "LegacyOrderRecord_importId_idx" ON "LegacyOrderRecord"("importId");
CREATE INDEX "LegacyOrderRecord_customerId_idx" ON "LegacyOrderRecord"("customerId");

ALTER TABLE "LegacyOrderRecord" ADD CONSTRAINT "LegacyOrderRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegacyOrderRecord" ADD CONSTRAINT "LegacyOrderRecord_importId_fkey" FOREIGN KEY ("importId") REFERENCES "LegacyImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LegacyOrderRecord" ADD CONSTRAINT "LegacyOrderRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
