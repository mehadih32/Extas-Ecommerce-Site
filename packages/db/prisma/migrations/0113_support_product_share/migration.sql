-- PR 429 (S22, B4.6, B4.14 item 5, CN-031 lane C): the catalogue drawer — a product sent in a chat with its tracked link.
-- Additive: one nullable column and two unique indexes on a table nothing has written to before this PR.
-- `messageId`: the chat message that carried the product card (one share per message; a second press of the same Send
-- finds the first). `refCode`: the link's `r=` reference, unique in its store so a click or an order credits one chat.
ALTER TABLE "SupportProductShare" ADD COLUMN "messageId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "SupportProductShare_messageId_key" ON "SupportProductShare"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportProductShare_storeId_refCode_key" ON "SupportProductShare"("storeId", "refCode");
