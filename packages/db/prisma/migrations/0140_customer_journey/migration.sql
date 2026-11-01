-- PR 288 (S14; Blueprint B5.3; BACKEND-ARCHITECTURE §5.5 CUS-02 "Journey"): the journey view reads a customer's visits,
-- messages, reviews and conversations by his profile ids. Indexes only; nothing is changed, renamed or dropped.

-- CreateIndex
CREATE INDEX "AnalyticsEvent_storeId_customerId_occurredAt_idx" ON "AnalyticsEvent"("storeId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "NotificationLog_storeId_customerId_createdAt_idx" ON "NotificationLog"("storeId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_storeId_customerId_idx" ON "Review"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "Conversation_storeId_customerId_idx" ON "Conversation"("storeId", "customerId");
