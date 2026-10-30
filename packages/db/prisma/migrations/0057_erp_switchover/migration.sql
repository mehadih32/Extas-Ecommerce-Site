-- PR 619 (CN-028, CN-029 Phase 2; docs/erp/site-changes-v6.md §3, docs/RETAIL-ERP-MODEL.md §9 and §16): the switch-over
-- to ERP contract v6, per store and per ERP link. ErpSwitchRun keeps every dry run, switch and new link epoch with what
-- it saw and did; ErpSwitchOrder keeps the ERP's list of the old orders it moved on the switch date (the shop's opening
-- items). Both are history: never edited, never removed. Everything here only adds; nothing is changed, renamed or
-- dropped. Migration number 0057 is Prohori's (CN-029 Phase 2).

-- CreateEnum
CREATE TYPE "ErpSwitchRunKind" AS ENUM ('DRY_RUN', 'SWITCH', 'NEW_LINK');

-- CreateEnum
CREATE TYPE "ErpSwitchOrderKind" AS ENUM ('NOT_OUT', 'OUT', 'ADVANCE', 'UNPAID');

-- CreateTable
CREATE TABLE "ErpSwitchRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "kind" "ErpSwitchRunKind" NOT NULL,
    "switchDate" DATE,
    "ok" BOOLEAN NOT NULL,
    "blockers" TEXT[],
    "fingerprint" TEXT,
    "report" JSONB NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpSwitchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpSwitchOrder" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "switchDate" DATE NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "kind" "ErpSwitchOrderKind" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "consignmentId" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "orderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpSwitchOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpSwitchRun_storeId_createdAt_idx" ON "ErpSwitchRun"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ErpSwitchRun_linkId_kind_createdAt_idx" ON "ErpSwitchRun"("linkId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ErpSwitchOrder_storeId_kind_idx" ON "ErpSwitchOrder"("storeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ErpSwitchOrder_linkId_externalOrderId_kind_key" ON "ErpSwitchOrder"("linkId", "externalOrderId", "kind");

-- AddForeignKey
ALTER TABLE "ErpSwitchRun" ADD CONSTRAINT "ErpSwitchRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpSwitchRun" ADD CONSTRAINT "ErpSwitchRun_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpSwitchOrder" ADD CONSTRAINT "ErpSwitchOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpSwitchOrder" ADD CONSTRAINT "ErpSwitchOrder_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HAND-WRITTEN: both are locked like the other v6 ledgers (schema-meta APPEND_ONLY_LOCKED): the app's role cannot change
-- or remove a row, and a trigger refuses it for every role.
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpSwitchRun" FROM extas_app;
CREATE TRIGGER "ErpSwitchRun_append_only" BEFORE UPDATE OR DELETE ON "ErpSwitchRun" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpSwitchRun_no_truncate" BEFORE TRUNCATE ON "ErpSwitchRun" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpSwitchOrder" FROM extas_app;
CREATE TRIGGER "ErpSwitchOrder_append_only" BEFORE UPDATE OR DELETE ON "ErpSwitchOrder" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpSwitchOrder_no_truncate" BEFORE TRUNCATE ON "ErpSwitchOrder" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
