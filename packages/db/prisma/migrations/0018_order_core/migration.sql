-- PR 138 (S05; CN-022, owner approval 23 Oct 2026, BACKEND-ARCHITECTURE §6.5.0–6.5.1, §6.5.7, §6.6 S1/S9/S10/S18), with
-- PR 144 (cancellation), PR 145 (duplicate-order defence), PR 147 (notes and internal flags) and PR 153 (hold and
-- release): the order core. Only enum values, columns and indexes are added: nothing is dropped, rewritten or deleted,
-- and every new NOT NULL column has a default, so existing orders stay valid (version 0, no flags, not cancel-pending).
--
-- - OrderStatus gains AWAITING_ADVANCE (the risk level or a gift needs an advance first, F-043).
-- - ShipmentStatus gains CANCEL_REQUESTED (cancel after booking asked, D5); the courier's answer is recorded on the
--   shipment as its own step (who, when, the courier's reference, the outcome).
-- - Order gains `version` (every order command adds one; an older version is refused with STALE), the hold's reason
--   code and the state it was held from, the cancel note, the customer's cancel request (CN-020 (5)), the D5 flags
--   cancelPending / customerWantsChange, the advance's amount and due time, and the staff's internal flags.
-- - OrderEvent gains `reasonCode`. OrderEvent stays append-only (0010_append_only): adding a column fires no row
--   trigger, and its UPDATE/DELETE/TRUNCATE guards and the extas_app REVOKE are untouched.
-- - Refund gains `source` and `idempotencyKey` (unique per store): one refund REQUEST per cause (F-041). A request
--   moves no money; approving and paying it stays the owner's (CLAUDE.md rule 6, PR 172).
-- - OrderNote gets an (orderId, createdAt) index for the order's notes, newest first.
--
-- The order status is written only by @extas/orders (packages/orders), through its commands, each under the order's
-- row lock with an OrderEvent and an AuditLog row in the same transaction.

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_ADVANCE';

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'CANCEL_REQUESTED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "advanceDueAt" TIMESTAMPTZ(3),
ADD COLUMN     "advanceRequiredMinor" INTEGER,
ADD COLUMN     "cancelNote" TEXT,
ADD COLUMN     "cancelPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelRequestReason" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN     "customerWantsChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "holdFromStatus" "OrderStatus",
ADD COLUMN     "holdReasonCode" TEXT,
ADD COLUMN     "internalFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderEvent" ADD COLUMN     "reasonCode" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "cancelConfirmedAt" TIMESTAMPTZ(3),
ADD COLUMN     "cancelConfirmedById" UUID,
ADD COLUMN     "cancelOutcome" TEXT,
ADD COLUMN     "cancelRef" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "OrderNote_orderId_createdAt_idx" ON "OrderNote"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_storeId_orderId_idx" ON "Refund"("storeId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_storeId_idempotencyKey_key" ON "Refund"("storeId", "idempotencyKey");
