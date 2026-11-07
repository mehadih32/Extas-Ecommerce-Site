-- PR 616 follow-up 558 (S09, PR 615) — the books' hash chains get a versioned hash. Every row already written keeps
-- hashVersion 1 and its hash as it is (nothing is re-hashed, nothing is edited: the tables stay append-only); new rows
-- are written with hashVersion 2, whose canonical form also covers the columns version 1 left out (a ledger entry's
-- erpEventRowId, adjustmentId and createdById; a day close's ERP closing balance, goods, losses, pipeline, payments, tie
-- remainder, runId and closedById; a period close's day counts, override reason, PIN mark and closedById). The
-- version itself is inside the version 2 hash, so a row can never be moved back to version 1. Additive only.
-- AlterTable
ALTER TABLE "ErpAccountEntry" ADD COLUMN     "hashVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "BooksDayClose" ADD COLUMN     "hashVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "BooksPeriodClose" ADD COLUMN     "hashVersion" INTEGER NOT NULL DEFAULT 1;
