-- PR 264 (S13, Blueprint C6.2 point 4) — the refused-parcel exclusion list is one audience per store (kind 'EXCLUSION',
-- made by the shop the first time it is needed). Partial (the Prisma schema cannot say "WHERE"), so it lives here only.
-- Additive only: one index. Nothing is changed, renamed or dropped.

-- CreateIndex
CREATE UNIQUE INDEX "Audience_storeId_exclusion_key" ON "Audience"("storeId") WHERE "kind" = 'EXCLUSION';
