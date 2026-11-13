-- PR 702 (S28; admin prototype v5, Settings -> Staff controls): the end-of-day cash / bKash sheet one staff member hands over. One new table, nothing else is changed, dropped or rewritten; a wrong count is put right with a newer row, the older stays.

-- CreateTable
CREATE TABLE "CashHandover" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "staffUserId" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "expectedMinor" INTEGER NOT NULL,
    "countedMinor" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashHandover_storeId_day_idx" ON "CashHandover"("storeId", "day");

-- CreateIndex
CREATE INDEX "CashHandover_storeId_staffUserId_day_idx" ON "CashHandover"("storeId", "staffUserId", "day");

-- AddForeignKey
ALTER TABLE "CashHandover" ADD CONSTRAINT "CashHandover_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CashHandover (PR 702): a count is never edited or removed; a wrong one is put right with a newer row.
REVOKE UPDATE, DELETE, TRUNCATE ON "CashHandover" FROM extas_app;
CREATE TRIGGER "CashHandover_append_only" BEFORE UPDATE OR DELETE ON "CashHandover" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "CashHandover_no_truncate" BEFORE TRUNCATE ON "CashHandover" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
