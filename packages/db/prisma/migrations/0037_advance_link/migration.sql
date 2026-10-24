-- PR 542 (S06; CN-018, SIM-F-016): the one-click advance request from the order. A payment asked from the order gets
-- its pay link's token (`/pay/<linkToken>`, the same on every try of that request); a part of the amount due asked
-- first uses the PART_ADVANCE purpose that 0036 added for the checkout's advance. Additive only: one nullable column,
-- one index.
ALTER TABLE "Payment" ADD COLUMN "linkToken" TEXT;

CREATE INDEX "Payment_linkToken_idx" ON "Payment"("linkToken");
