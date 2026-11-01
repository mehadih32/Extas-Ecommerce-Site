-- PR 290: e-mail marketing — an e-mail send's segment, words and progress (Broadcast), and each e-mail's opens, clicks
-- and unsubscribe (NotificationLog).
ALTER TABLE "Broadcast" ADD COLUMN "segmentId" UUID;
ALTER TABLE "Broadcast" ADD COLUMN "subject" TEXT;
ALTER TABLE "Broadcast" ADD COLUMN "body" TEXT;
ALTER TABLE "Broadcast" ADD COLUMN "locale" TEXT;
ALTER TABLE "Broadcast" ADD COLUMN "queuedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Broadcast" ADD COLUMN "startedAt" TIMESTAMPTZ(3);
ALTER TABLE "Broadcast" ADD COLUMN "finishedAt" TIMESTAMPTZ(3);
CREATE INDEX "Broadcast_storeId_status_scheduledAt_idx" ON "Broadcast"("storeId", "status", "scheduledAt");
ALTER TABLE "NotificationLog" ADD COLUMN "openedAt" TIMESTAMPTZ(3);
ALTER TABLE "NotificationLog" ADD COLUMN "clickedAt" TIMESTAMPTZ(3);
ALTER TABLE "NotificationLog" ADD COLUMN "clicks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotificationLog" ADD COLUMN "unsubscribedAt" TIMESTAMPTZ(3);
CREATE INDEX "NotificationLog_broadcastId_status_idx" ON "NotificationLog"("broadcastId", "status");
