-- PR 558 (S04; CN-012 (2), CN-018 (2); SIM-F-016): the Parameter for Checkout panel. A layer can ask a part of the
-- amount ahead (a percentage of what is due, 1 to 99) besides the delivery charge or the full amount; the checkout's
-- payment for such a part is its own purpose (PR 560). The panel lists the store's layers in order, archived ones left
-- out. Everything is added; nothing is dropped, renamed or removed.

-- AlterEnum
ALTER TYPE "AdvanceRequirement" ADD VALUE 'PART_AMOUNT';
ALTER TYPE "PaymentPurpose" ADD VALUE 'PART_ADVANCE';

-- AlterTable
ALTER TABLE "CheckoutParameterLayer" ADD COLUMN     "partPercent" INTEGER;

-- CreateIndex
CREATE INDEX "CheckoutParameterLayer_storeId_archivedAt_position_idx" ON "CheckoutParameterLayer"("storeId", "archivedAt", "position");
