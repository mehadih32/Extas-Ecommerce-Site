-- PR 282 (S13) — the marketing calendar: the owner's own plan lines (CalendarEntry kind `plan`) last from a day to an
-- end day, carry a Bengali title and a short note, and keep who made them; the calendar finds them by store and kind.
-- Additive only; nothing is dropped or renamed.
ALTER TABLE "CalendarEntry" ADD COLUMN "endDate" DATE;
ALTER TABLE "CalendarEntry" ADD COLUMN "titleBn" TEXT;
ALTER TABLE "CalendarEntry" ADD COLUMN "note" TEXT;
ALTER TABLE "CalendarEntry" ADD COLUMN "createdById" UUID;
CREATE INDEX "CalendarEntry_storeId_kind_date_idx" ON "CalendarEntry"("storeId", "kind", "date");
