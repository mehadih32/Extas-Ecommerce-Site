-- PR 83 follow-up 683 (S02) — when a bag line last grew by the shopper's hand (the same item added again, a raised
-- quantity, back from "saved for later"), so an A/B test's "added to the bag" counts it like a new line. Null on every
-- earlier line. Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "raisedAt" TIMESTAMPTZ(3);
