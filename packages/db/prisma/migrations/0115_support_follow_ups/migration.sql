-- PR 433 (S22, B4.7 bullet 3, B4.14 item 9, CN-031 lane C): follow-ups on chats without an order — three columns and three indexes.
-- Additive: the SupportFollowUp table (schema skeleton, empty until this PR) gets the person it counts against, the
-- reply that carried it and who sent or skipped it; the inbox reads the waiting ones, a chat its own, the caps a
-- person's latest sent one.

-- AlterTable
ALTER TABLE "SupportFollowUp" ADD COLUMN     "decidedById" UUID,
ADD COLUMN     "messageId" UUID,
ADD COLUMN     "personKey" TEXT;

-- CreateIndex
CREATE INDEX "SupportFollowUp_storeId_outcome_scheduledAt_idx" ON "SupportFollowUp"("storeId", "outcome", "scheduledAt");

-- CreateIndex
CREATE INDEX "SupportFollowUp_conversationId_createdAt_idx" ON "SupportFollowUp"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportFollowUp_storeId_personKey_sentAt_idx" ON "SupportFollowUp"("storeId", "personKey", "sentAt");
