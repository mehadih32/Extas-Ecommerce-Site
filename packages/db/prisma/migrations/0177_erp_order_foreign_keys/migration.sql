-- PR 610 (PR 614; S09) follow-up 534 — the foreign keys left out of 0053 until PR 614 settled how exchange orders write
-- their ERP rows: ErpOrder.orderId → Order and ErpOrderLine.orderItemId → OrderItem (every writer names the shop's own
-- order and line; an exchange order is a real order, `<old>-X<n>`). Nothing is deleted or rewritten.
-- Added NOT VALID (new and changed rows are checked at once, no long lock), then validated only when every existing row
-- already names a real order or line: an installation with an odd old row keeps the check for new rows and its old rows
-- as they are (VALIDATE can be run by hand later).
-- AddForeignKey
ALTER TABLE "ErpOrder" ADD CONSTRAINT "ErpOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "ErpOrderLine" ADD CONSTRAINT "ErpOrderLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "ErpOrder" e WHERE NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."id" = e."orderId")) THEN
    ALTER TABLE "ErpOrder" VALIDATE CONSTRAINT "ErpOrder_orderId_fkey";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ErpOrderLine" l WHERE l."orderItemId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."id" = l."orderItemId")) THEN
    ALTER TABLE "ErpOrderLine" VALIDATE CONSTRAINT "ErpOrderLine_orderItemId_fkey";
  END IF;
END $$;
