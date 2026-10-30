-- PR 616 (CN-028, CN-029 Phase 1; docs/RETAIL-ERP-MODEL.md §4.3, §4.4): the owner's PIN for the books. A correction of
-- the books (`books.adjust`) and a month closed with differences, re-opened or a year signed off (`books.close`) need it
-- at the moment they are done. Kept on the owner's own staff row as a scrypt hash only (never the PIN, never logged);
-- the wrong tries a person types are counted on that person's row and lock the PIN for `books.pin.lockMinutes`.
-- Everything here only adds; nothing is changed, renamed or dropped.

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "booksPinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "booksPinHash" TEXT,
ADD COLUMN     "booksPinLockedTil" TIMESTAMPTZ(3),
ADD COLUMN     "booksPinSetAt" TIMESTAMPTZ(3);

-- qa-gate (CN-029 Phase 1): what the database keeps true whatever the code does.
-- "Paid to ERP" (follow-up 551): the form's request key, one record per key and link (a double tap or a retry answers
-- the record already written).
ALTER TABLE "ErpPaymentRecord" ADD COLUMN     "requestKey" TEXT;
CREATE UNIQUE INDEX "ErpPaymentRecord_linkId_requestKey_key" ON "ErpPaymentRecord"("linkId", "requestKey");

-- One correction per difference, ever (two corrections of one difference at the same moment: one is refused).
CREATE UNIQUE INDEX "BooksAdjustment_linkId_differenceId_key" ON "BooksAdjustment"("linkId", "differenceId");

-- One BILL entry per order and link, whatever its key (by consignment or by order). Partial (the Prisma schema cannot
-- say "WHERE"), so it lives here only; a reversal or a correction of a bill is another kind and is not counted.
CREATE UNIQUE INDEX "ErpAccountEntry_linkId_bill_order_key" ON "ErpAccountEntry"("linkId", "externalOrderId") WHERE "kind" = 'BILL';
