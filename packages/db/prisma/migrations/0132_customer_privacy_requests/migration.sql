-- PR 623 (S18, CN-034): the customer's own privacy request files into PR 382's list. A request now says what was
-- asked (ERASURE, as every request so far, or COPY of his data), who filed it (STAFF on the Privacy & data page, or the
-- CUSTOMER from his account) and, for an approved copy, when and by whom it was approved. Everything here only adds:
-- existing rows read as staff erasure requests; nothing is changed, renamed or dropped.

-- AlterTable
ALTER TABLE "CustomerErasureRequest" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ERASURE',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'STAFF',
ADD COLUMN "decidedAt" TIMESTAMPTZ(3),
ADD COLUMN "decidedById" UUID;

-- CreateIndex
CREATE INDEX "CustomerErasureRequest_storeId_customerId_kind_idx" ON "CustomerErasureRequest"("storeId", "customerId", "kind");

-- One waiting request of each kind per person (the same tap twice, or two tabs at once: the second finds the first).
-- Partial (the Prisma schema cannot say "WHERE"), so it lives here only.
CREATE UNIQUE INDEX "CustomerErasureRequest_open_kind_key" ON "CustomerErasureRequest"("storeId", "customerId", "kind") WHERE "status" = 'REQUESTED';
