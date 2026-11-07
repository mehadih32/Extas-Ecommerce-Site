-- PR 72 follow-up 100 (S02) — the words shoppers searched, counted per day, and how often nothing was found
-- (`search.insights`, off as shipped). Words and counts only: no customer, visitor, address or time of day.
-- Additive only; nothing is dropped or renamed.
-- CreateTable
CREATE TABLE "SearchTerm" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "term" TEXT NOT NULL,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "emptySearches" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchTerm_storeId_day_idx" ON "SearchTerm"("storeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "SearchTerm_storeId_day_term_key" ON "SearchTerm"("storeId", "day", "term");

-- AddForeignKey
ALTER TABLE "SearchTerm" ADD CONSTRAINT "SearchTerm_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
