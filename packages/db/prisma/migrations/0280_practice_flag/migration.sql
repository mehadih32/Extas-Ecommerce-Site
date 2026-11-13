-- PR 706 (CN-049): practice data. Additive only: one flag per table that practice records live in (default false, so
-- every existing row is real). "Reset practice data" deletes only rows where the flag is true.
ALTER TABLE "Order" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shipment" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CourierSettlement" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CourierClaim" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CheckoutDraft" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CourierAccount" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "isPractice" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "idx_order_practice" ON "Order"("storeId", "isPractice");
CREATE INDEX "idx_product_practice" ON "Product"("storeId", "isPractice");
