-- PR 105, 110, 112 (S04, the bag): a bag line the customer takes out is archived, never deleted (CLAUDE.md hard rule 3),
-- so "Undo" brings the same line back (CartItem.removedAt); the customer's answers to the "same product in two sizes"
-- card are kept on the bag (Cart.sizeAnswers, SIM-F-036); every coupon says who can use it — guests, signed-in
-- customers or both (Coupon.audience, CN-018 answer 9, SIM-F-009; existing coupons stay open to both). Only columns are
-- added: nothing is dropped, rewritten or deleted.

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "sizeAnswers" JSONB;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "removedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'ALL';
