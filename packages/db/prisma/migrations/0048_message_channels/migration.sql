-- PR 291, 292, 298 (S14, the Messages control centre, CN-019; BACKEND-ARCHITECTURE §5.7, §6.5.6, §8.8):
-- PR 291 the SMS gateway (masking name, parts) and PR 292 the WhatsApp Business provider: a template's approval state at
-- the provider (Meta's review, the SMS gateway's registered text) with its reason and when it was read; on each message
-- the SMS parts it took, when the provider said it reached the phone and the provider's own last word (its receipt),
-- found by the provider's message id. PR 298: a consent answer's scope — MARKETING (the offer ticks) or ALL (a STOP:
-- every message on that channel) — and the staff member who recorded it at the customer's request, found by phone.
-- Everything here only adds; no column is changed, renamed or dropped; nothing is deleted. No message text is stored.

-- AlterTable
ALTER TABLE "NotificationTemplate" ADD COLUMN     "providerCheckedAt" TIMESTAMPTZ(3),
ADD COLUMN     "providerReason" TEXT,
ADD COLUMN     "providerStatus" TEXT;

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "deliveredAt" TIMESTAMPTZ(3),
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "segments" INTEGER;

-- AlterTable
ALTER TABLE "ConsentRecord" ADD COLUMN     "recordedById" UUID,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'MARKETING';

-- CreateIndex
CREATE INDEX "NotificationLog_provider_providerMessageId_idx" ON "NotificationLog"("provider", "providerMessageId");

-- CreateIndex
CREATE INDEX "ConsentRecord_storeId_phone_channel_createdAt_idx" ON "ConsentRecord"("storeId", "phone", "channel", "createdAt");
