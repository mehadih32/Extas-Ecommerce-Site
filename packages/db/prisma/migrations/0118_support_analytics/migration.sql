-- PR 436 (S22, B4.13, B4.14 item 12, CN-031 lane C): support analytics. Additive: two indexes so the report reads a
-- store's customer messages and answers in a period, and a store's tickets opened in a period, without a full scan.
-- Nothing is dropped or changed.

-- CreateIndex
CREATE INDEX "Message_storeId_direction_sentAt_idx" ON "Message"("storeId", "direction", "sentAt");

-- CreateIndex
CREATE INDEX "Ticket_storeId_createdAt_idx" ON "Ticket"("storeId", "createdAt");
