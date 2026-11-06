-- PR 532 follow-up 662 (S13) — the deep conversion feed's extra event data (the courier outcome and the visitor's
-- intent) is kept on the event at its first send, so a retry later sends the same facts as of the event's own time
-- instead of reading the order again. Null on every earlier row (read at its next send, as before). Additive only.
-- AlterTable
ALTER TABLE "TrackedEvent" ADD COLUMN     "extra" JSONB;
