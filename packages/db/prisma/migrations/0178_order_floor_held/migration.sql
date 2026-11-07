-- PR 609 follow-up 521 (S01) — the order keeps what its offers held back at the price floor (an offer stops at a
-- line's lowest price; the rules engine's `floorHeld`), so the order page can say "the offer stopped at the lowest
-- price" and a smaller discount is never a surprise. Null on every earlier order. Display only: no price, discount or
-- payment changes. Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "floorHeldMinor" INTEGER;
