-- PR 235 (S11, CN-031 lane A): the 404 report with one-click fixes. A person can mark a counted address as nothing to
-- fix (a scan, a bot): it stays counted and out of the open list. The report lists the addresses by their last visit.
-- Everything here only adds; nothing is changed, renamed or dropped. Migration number 0058 is lane A's (CN-031).

-- AlterTable
ALTER TABLE "NotFoundHit" ADD COLUMN     "ignoredAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "NotFoundHit_storeId_lastSeenAt_idx" ON "NotFoundHit"("storeId", "lastSeenAt");
