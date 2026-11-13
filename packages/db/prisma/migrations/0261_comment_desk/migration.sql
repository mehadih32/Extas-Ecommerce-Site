-- PR 693 (S28, CN-048) — Inbox › Comments: a public comment can be hidden on the Page and answered once by the desk.
-- Additive only: three nullable columns on "Message"; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "hiddenAt" TIMESTAMPTZ(3),
ADD COLUMN     "hideReason" TEXT,
ADD COLUMN     "autoRepliedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "Message_storeId_hiddenAt_idx" ON "Message"("storeId", "hiddenAt");
