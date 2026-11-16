-- PR 971, 972 (S28; admin prototype v5, final parity round). Additive only: two nullable columns on Cart (the shop page the
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

    CONSTRAINT "BulkQuoteSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkQuoteSend_storeId_quoteId_sentAt_idx" ON "BulkQuoteSend"("storeId", "quoteId", "sentAt");

-- AddForeignKey
ALTER TABLE "BulkQuoteSend" ADD CONSTRAINT "BulkQuoteSend_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulkQuoteSend" ADD CONSTRAINT "BulkQuoteSend_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "BulkQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
