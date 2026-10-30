-- PR 612–614 (CN-028, CN-029 Phase 1, Pherot's reserved number 0054): returns and exchanges on the ERP model
-- (docs/RETAIL-ERP-MODEL.md §6, §7; docs/erp/site-changes-v6.md §2.5, §2.9, §2.10). Additive only: columns with a
-- default or empty, one new table; nothing is dropped, renamed or removed (CLAUDE.md rule 3). In ERP contract v5 nothing
-- reads or writes them.
--   612  ErpReturnList: sendAttempts, lastTriedAt, resendOfId (a list that sends the refused parcels of another again,
--        under a new returnListId), closedById. ErpReturnListParcel: the ERP's refusal reason and the pieces it named, a
--        parcel taken although the shop did not expect it (with a note), the shop's return records it received, the
--        exchange whose old piece it carries, the list it was sent again on.
--   613  ErpReturnsCompare: one compare of the Returns section with the ERP's GET /returns/summary?date= (every night and
--        after a pull), on the store's own ERP link (composite foreign key linkId + storeId, as every v6 table).
--   614  ErpExchangeLink: the shop's new parcel, each send (a retry after a stock refusal uses a new idempotency key), the
--        ERP's last refusal, its deadline day, when it finished, the note sent, the late-return mark. ErpExchangeLine:
--        what Retail paid for the old piece, what the customer pays for the swap, the shop's exchange and order lines.

-- AlterTable
ALTER TABLE "ErpExchangeLine" ADD COLUMN     "customerPaysMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exchangeItemId" UUID,
ADD COLUMN     "oldOrderItemId" UUID,
ADD COLUMN     "oldShopPriceMinor" INTEGER;

-- AlterTable
ALTER TABLE "ErpExchangeLink" ADD COLUMN     "deadline" DATE,
ADD COLUMN     "erpUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "finishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastRefusal" TEXT,
ADD COLUMN     "lastRefusalDetails" JSONB,
ADD COLUMN     "lastTriedAt" TIMESTAMPTZ(3),
ADD COLUMN     "lateReturn" JSONB,
ADD COLUMN     "newOrderId" UUID,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "sendAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ErpReturnList" ADD COLUMN     "closedById" UUID,
ADD COLUMN     "lastTriedAt" TIMESTAMPTZ(3),
ADD COLUMN     "resendOfId" UUID,
ADD COLUMN     "sendAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ErpReturnListParcel" ADD COLUMN     "answerPieces" JSONB,
ADD COLUMN     "exchangeLinkId" UUID,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "resentInListId" UUID,
ADD COLUMN     "returnRecordIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "unexpected" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ErpReturnsCompare" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "trigger" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "shop" JSONB NOT NULL,
    "erp" JSONB,
    "differences" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "ranAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpReturnsCompare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpReturnsCompare_storeId_date_idx" ON "ErpReturnsCompare"("storeId", "date");

-- CreateIndex
CREATE INDEX "ErpReturnsCompare_linkId_ranAt_idx" ON "ErpReturnsCompare"("linkId", "ranAt");

-- AddForeignKey
ALTER TABLE "ErpReturnsCompare" ADD CONSTRAINT "ErpReturnsCompare_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpReturnsCompare" ADD CONSTRAINT "ErpReturnsCompare_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HAND-WRITTEN: ErpReturnsCompare (PR 613) is a history of compares: a run is never edited and never removed (the next
-- run is a new row), so it is locked like the other v6 ledgers (schema-meta APPEND_ONLY_LOCKED).
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpReturnsCompare" FROM extas_app;
CREATE TRIGGER "ErpReturnsCompare_append_only" BEFORE UPDATE OR DELETE ON "ErpReturnsCompare" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpReturnsCompare_no_truncate" BEFORE TRUNCATE ON "ErpReturnsCompare" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
