-- PR 407, 425.
--
-- PR 407 (S20; B2.1): the customer invoice is issued once per order and kept. Each invoice row holds its printed
-- number (it never changes), a fingerprint of the order content it shows, the content as issued, and the order's last
-- change it was compared with. A new version (same number) is made only when the order itself is edited; a payment or a
-- delivery never makes one. The invoice job finds changed orders through a new index on the order's last change, and
-- each invoice row points at its order. Nothing here moves money. Everything is added; nothing is dropped.

-- AlterTable
ALTER TABLE "GeneratedDocument" ADD COLUMN     "checkedAt" TIMESTAMPTZ(3),
ADD COLUMN     "data" JSONB,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "number" TEXT;

-- CreateIndex
CREATE INDEX "GeneratedDocument_storeId_kind_createdAt_idx" ON "GeneratedDocument"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_storeId_kind_orderId_version_key" ON "GeneratedDocument"("storeId", "kind", "orderId", "version");

-- CreateIndex
CREATE INDEX "idx_order_updated" ON "Order"("storeId", "updatedAt");

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PR 425 (S22; B4.4): the support core. A conversation keeps what it is about, the order it is linked to, who wrote
-- last and the first words of that message, since when the customer has been waiting, and when it was taken. A message
-- keeps the sender's name as it was (who replied never changes), the key of one press of Send (a press sent twice is
-- one message), why a reply did not go out, and one message per channel message id. A file keeps its own name, type
-- and size, and where the channel offered it until it is copied to our storage. The who-did-what log
-- (ConversationEvent) is append-only at the database like the audit log (0010_append_only): the app role may only
-- INSERT and SELECT, and a trigger refuses UPDATE, DELETE and TRUNCATE for everybody. Everything is added; nothing is
-- dropped.

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "assignedAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastDirection" TEXT,
ADD COLUMN     "lastPreview" TEXT,
ADD COLUMN     "orderId" UUID,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "waitingSince" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "failReason" TEXT,
ADD COLUMN     "requestKey" TEXT,
ADD COLUMN     "senderName" TEXT;

-- AlterTable
ALTER TABLE "MessageAttachment" ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "ConversationEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "conversationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorStaffId" UUID,
    "actorName" TEXT,
    "actorAgentKey" TEXT,
    "messageId" UUID,
    "data" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationEvent_conversationId_createdAt_idx" ON "ConversationEvent"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationEvent_storeId_kind_createdAt_idx" ON "ConversationEvent"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_storeId_lastMessageAt_idx" ON "Conversation"("storeId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_requestKey_key" ON "Message"("conversationId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_externalMessageId_key" ON "Message"("conversationId", "externalMessageId");

-- CreateIndex
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");

-- AddForeignKey
ALTER TABLE "ConversationEvent" ADD CONSTRAINT "ConversationEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvent" ADD CONSTRAINT "ConversationEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ConversationEvent (PR 425): who did what in a conversation.
REVOKE UPDATE, DELETE, TRUNCATE ON "ConversationEvent" FROM extas_app;
CREATE TRIGGER "ConversationEvent_append_only" BEFORE UPDATE OR DELETE ON "ConversationEvent" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ConversationEvent_no_truncate" BEFORE TRUNCATE ON "ConversationEvent" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
