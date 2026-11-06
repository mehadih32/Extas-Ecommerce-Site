-- PR 274 (S13, incomplete-order capture; SIM-F-026) — an unfinished checkout can be handed to a person and marked
-- handled with a short note (Orders › Incomplete). Additive only: five nullable columns and one index. Nothing is
-- changed, renamed or dropped.

-- AlterTable
ALTER TABLE "CheckoutDraft" ADD COLUMN "assignedToId" UUID,
ADD COLUMN "assignedAt" TIMESTAMPTZ(3),
ADD COLUMN "handledAt" TIMESTAMPTZ(3),
ADD COLUMN "handledById" UUID,
ADD COLUMN "handledNote" TEXT;

-- CreateIndex
CREATE INDEX "CheckoutDraft_storeId_assignedToId_idx" ON "CheckoutDraft"("storeId", "assignedToId");
