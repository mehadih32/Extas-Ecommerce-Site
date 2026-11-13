-- PR 686 (S28, admin prototype v5) — shop ranking: a 0–100 score, the owner's pin and the saved place on each product. Additive only; every product starts at 0 with no pin.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "rankPin" TEXT,
ADD COLUMN     "rankPosition" INTEGER,
ADD COLUMN     "rankScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rankedAt" TIMESTAMPTZ(3);
