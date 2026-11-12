-- PR 664 (S28 Admin v5) — Price adjust on every order: the ledger of adjustments (amount, percent, wallet, free delivery),
-- one new line per adjustment, never edited. Additive only; nothing is dropped or renamed.
-- CreateEnum
CREATE TYPE "OrderPriceAdjustmentKind" AS ENUM ('AMOUNT', 'PERCENT', 'WALLET', 'FREE_DELIVERY');

-- CreateEnum
CREATE TYPE "OrderPriceAdjustmentState" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

-- CreateTable
CREATE TABLE "OrderPriceAdjustment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" "OrderPriceAdjustmentKind" NOT NULL,
    "state" "OrderPriceAdjustmentState" NOT NULL,
    "percent" INTEGER,
    "amountMinor" INTEGER NOT NULL,
    "reasonKey" TEXT NOT NULL,
    "note" TEXT,
    "requestId" UUID,
    "requestedById" UUID,
    "decidedById" UUID,
    "pinChecked" BOOLEAN NOT NULL DEFAULT false,
    "totalBeforeMinor" INTEGER NOT NULL,
    "totalAfterMinor" INTEGER NOT NULL,
    "walletEntryId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderPriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderPriceAdjustment_storeId_orderId_createdAt_idx" ON "OrderPriceAdjustment"("storeId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderPriceAdjustment_storeId_state_createdAt_idx" ON "OrderPriceAdjustment"("storeId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "OrderPriceAdjustment_requestId_idx" ON "OrderPriceAdjustment"("requestId");

-- AddForeignKey
ALTER TABLE "OrderPriceAdjustment" ADD CONSTRAINT "OrderPriceAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPriceAdjustment" ADD CONSTRAINT "OrderPriceAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- OrderPriceAdjustment is @append-only (a ledger: a correction is a new line): locked at the database (PR 139).
REVOKE UPDATE, DELETE, TRUNCATE ON "OrderPriceAdjustment" FROM extas_app;
CREATE TRIGGER "OrderPriceAdjustment_append_only" BEFORE UPDATE OR DELETE ON "OrderPriceAdjustment" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "OrderPriceAdjustment_no_truncate" BEFORE TRUNCATE ON "OrderPriceAdjustment" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
