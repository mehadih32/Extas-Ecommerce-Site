-- PR 405 (S20, ORD-04b, CN-031 lane C): the picking list on screen — each size line the picker marks pulled (or takes
-- the mark back) is one row with the orders and pieces it held at that moment. Additive: a new table only.
CREATE TABLE "PickingTick" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "lineKey" TEXT NOT NULL,
    "orderIds" UUID[],
    "quantity" INTEGER NOT NULL,
    "ticked" BOOLEAN NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickingTick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PickingTick_storeId_lineKey_createdAt_idx" ON "PickingTick"("storeId", "lineKey", "createdAt");

ALTER TABLE "PickingTick" ADD CONSTRAINT "PickingTick_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PickingTick (PR 405): a tick is never edited or removed; taking it back is a new row.
REVOKE UPDATE, DELETE, TRUNCATE ON "PickingTick" FROM extas_app;
CREATE TRIGGER "PickingTick_append_only" BEFORE UPDATE OR DELETE ON "PickingTick" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "PickingTick_no_truncate" BEFORE TRUNCATE ON "PickingTick" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
