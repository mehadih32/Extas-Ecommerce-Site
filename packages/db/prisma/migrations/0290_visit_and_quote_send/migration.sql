-- PR 1061, 972 (S28; admin prototype v5, final parity round). Additive only: two nullable columns on Cart (the shop page the
-- bag was made on and the device kind, filled from now on) and one new append-only table, BulkQuoteSend (one row per press of
-- "Save & send quote"). Nothing is dropped, renamed, retyped or rewritten.

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "landingPage" TEXT,
ADD COLUMN "device" TEXT;

-- CreateTable
CREATE TABLE "BulkQuoteSend" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "quoteId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentById" UUID,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkQuoteSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkQuoteSend_storeId_quoteId_sentAt_idx" ON "BulkQuoteSend"("storeId", "quoteId", "sentAt");

-- AddForeignKey
ALTER TABLE "BulkQuoteSend" ADD CONSTRAINT "BulkQuoteSend_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkQuoteSend" ADD CONSTRAINT "BulkQuoteSend_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "BulkQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only (the standard lock, packages/db/src/schema-meta.ts APPEND_ONLY_LOCKED): no edit, no delete, no truncate.
REVOKE UPDATE, DELETE, TRUNCATE ON "BulkQuoteSend" FROM extas_app;
CREATE TRIGGER "BulkQuoteSend_append_only" BEFORE UPDATE OR DELETE ON "BulkQuoteSend" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "BulkQuoteSend_no_truncate" BEFORE TRUNCATE ON "BulkQuoteSend" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
