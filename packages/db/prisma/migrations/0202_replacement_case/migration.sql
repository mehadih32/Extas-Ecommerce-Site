-- PR 669 (S28 wave 1) — the replacement case: an exchange row can be a REPLACEMENT (a defective or wrong piece sent again free) with the date
-- its old piece is due back. Additive only: one new column with a default, one nullable column; nothing dropped or renamed.
-- AlterTable
ALTER TABLE "Exchange" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EXCHANGE',
ADD COLUMN     "oldPieceDueAt" TIMESTAMPTZ(3);

