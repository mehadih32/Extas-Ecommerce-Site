-- PR 668 (S28 wave 1): the call log also keeps the messages the team opened (kind CALL or MESSAGE). Additive; a default fills every old row.
-- AlterTable
ALTER TABLE "CheckoutDraftCall" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CALL';
