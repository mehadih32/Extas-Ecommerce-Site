-- PR 415 (S21, CN-015): customer problems found automatically. A problem remembers when the owner was last told about
-- it on Telegram (setting `health.alerts`, off as it ships), so one problem sends at most one line within the hours
-- set. Only adds a column; nothing is changed, renamed or dropped.
ALTER TABLE "CustomerProblem" ADD COLUMN "alertedAt" TIMESTAMPTZ(3);
