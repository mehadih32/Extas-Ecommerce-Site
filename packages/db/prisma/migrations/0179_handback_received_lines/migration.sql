-- PR 615 follow-up 552 (S08, PR 612) — the hand-back desk records which pieces were in the courier's bag: the ERP line
-- ids ticked on the parcel. The books' pipeline then moves only those pieces to WAITING_CHECK at the hand-back; an
-- empty list (every earlier parcel, or none ticked) keeps today's rule: every returning piece of the order. Record
-- only: no money moves. Additive only; nothing is dropped or renamed.
-- AlterTable
ALTER TABLE "ErpReturnListParcel" ADD COLUMN     "receivedLineIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
