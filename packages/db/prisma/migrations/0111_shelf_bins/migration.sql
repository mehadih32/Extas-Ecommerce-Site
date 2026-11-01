-- PR 412 (S20, B2.3, CN-031 lane C): the picking list read shelf by shelf — the shelf each style (product) is kept on.
-- Additive: a new table only. A move or a clear is a new row (append-only); the latest row per product is its shelf.
CREATE TABLE "ShelfBin" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShelfBin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShelfBin_storeId_productId_createdAt_idx" ON "ShelfBin"("storeId", "productId", "createdAt");

ALTER TABLE "ShelfBin" ADD CONSTRAINT "ShelfBin_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ShelfBin (PR 412): a shelf row is never edited or removed; a move or a clear is a new row.
REVOKE UPDATE, DELETE, TRUNCATE ON "ShelfBin" FROM extas_app;
CREATE TRIGGER "ShelfBin_append_only" BEFORE UPDATE OR DELETE ON "ShelfBin" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ShelfBin_no_truncate" BEFORE TRUNCATE ON "ShelfBin" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
