-- PR 148 (S05; CN-019, Blueprint B2.5, BACKEND-ARCHITECTURE §5.7, §6.5.6, §8.8): the order journey's messages. The
-- notification log gains the columns the send engine (@extas/messages) needs. Only nullable columns and one index are
-- added, so every row that already exists (the sign-in code SMS of PR 130) stays exactly as it is. Nothing is dropped,
-- rewritten or deleted.
--
-- WHAT THE COLUMNS ARE FOR
-- * step, locale: which journey step (placed, confirmed, day1Care …) and in which language; no message text is kept.
-- * sendAfter: not sent before this time (the step's delay, the quiet hours, the next try after a failure, PR 149).
-- * reason: why a row was SKIPPED or BLOCKED_BY_GUARD (a cap, the audience, no number, the master switch …).
-- * provider, mode: the sender that took the message (MOCK = "would send": nothing left the server).
-- * eventId: the order timeline row (OrderEvent) that planned it.
-- The index on (status, sendAfter) is the worker's "what is due now" read.

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "eventId" UUID,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "mode" "AdapterMode",
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "sendAfter" TIMESTAMPTZ(3),
ADD COLUMN     "step" TEXT;

-- CreateIndex
CREATE INDEX "NotificationLog_status_sendAfter_idx" ON "NotificationLog"("status", "sendAfter");
