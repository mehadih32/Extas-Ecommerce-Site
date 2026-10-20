-- PR 208-219 (S10 Smart Rules): the rule engine stores its customer texts, its values, its "applies to / except" scope,
-- where it is shown, its stacking flag, the owner's OK for money rules (CLAUDE.md rule 6) and a saved-but-not-live
-- draft on SmartRule; conflicts get the other side's type, a fingerprint (a re-check updates the same row), details and
-- the winner; notices get a key, names, a title, a button, a priority and a version. Only columns and indexes are
-- added: nothing is dropped, rewritten or deleted, and every existing row keeps its values (new columns are empty or
-- take their default).

-- AlterTable
ALTER TABLE "Notice" ADD COLUMN     "createdById" UUID,
ADD COLUMN     "cta" JSONB,
ADD COLUMN     "key" TEXT,
ADD COLUMN     "nameBn" TEXT,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "titleBn" TEXT,
ADD COLUMN     "titleEn" TEXT,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SmartRule" ADD COLUMN     "approvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "draft" JSONB,
ADD COLUMN     "draftAt" TIMESTAMPTZ(3),
ADD COLUMN     "draftById" UUID,
ADD COLUMN     "needsOwnerOk" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "params" JSONB,
ADD COLUMN     "placements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scope" JSONB,
ADD COLUMN     "stackable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "text" JSONB,
ADD COLUMN     "updatedById" UUID;

-- AlterTable
ALTER TABLE "SmartRuleConflict" ADD COLUMN     "detail" JSONB,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "otherType" TEXT NOT NULL DEFAULT 'rule',
ADD COLUMN     "resolvedById" UUID,
ADD COLUMN     "winnerRuleId" UUID;

-- CreateIndex
CREATE INDEX "Notice_storeId_enabled_idx" ON "Notice"("storeId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "Notice_storeId_key_key" ON "Notice"("storeId", "key");

-- CreateIndex
CREATE INDEX "SmartRuleConflict_storeId_resolvedAt_idx" ON "SmartRuleConflict"("storeId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmartRuleConflict_storeId_fingerprint_key" ON "SmartRuleConflict"("storeId", "fingerprint");

