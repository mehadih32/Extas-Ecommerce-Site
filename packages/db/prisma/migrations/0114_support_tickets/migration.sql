-- PR 431 (S22, B4.4, B4.14 item 7, CN-031 lane C): ticketing — two indexes, nothing else changes.
-- Additive: the Ticket table (schema skeleton, empty until this PR) is read by its chat on every customer message and
-- answer; the Late view and the late chats in the bell read the open chats whose timer (slaDueAt) ran out.

-- CreateIndex
CREATE INDEX "Ticket_conversationId_createdAt_idx" ON "Ticket"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_storeId_status_slaDueAt_idx" ON "Conversation"("storeId", "status", "slaDueAt");
