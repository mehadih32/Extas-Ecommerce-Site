-- PR 435 (S22, B4.11, B4.14 item 11, CN-031 lane C): the support app's push notifications. Additive: the connection
-- kind PUSH (web push with the store's VAPID key pair from Keys & connections; its mock until then), and on each
-- device's push subscription the last push that went out and the failures since, with an index for one person's
-- devices. Nothing is dropped; a device switched off keeps its row (revokedAt).

-- AlterEnum
ALTER TYPE "IntegrationKind" ADD VALUE IF NOT EXISTS 'PUSH';

-- AlterTable
ALTER TABLE "StaffPushSubscription" ADD COLUMN     "failCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastPushAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "StaffPushSubscription_staffUserId_revokedAt_idx" ON "StaffPushSubscription"("staffUserId", "revokedAt");
