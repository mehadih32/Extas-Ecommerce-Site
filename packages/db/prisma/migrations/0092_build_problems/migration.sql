-- PR 594 (S21, HLP-02): a problem reported on one PR of the build ("Report a problem on this PR"), with the status the
-- build team gives it. Only adds a table and its status list; nothing is changed, renamed or dropped.
-- CreateEnum
CREATE TYPE "BuildProblemStatus" AS ENUM ('OPEN', 'FIXING', 'FIXED', 'CLOSED');

-- CreateTable
CREATE TABLE "BuildProblem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "page" TEXT,
    "status" "BuildProblemStatus" NOT NULL DEFAULT 'OPEN',
    "statusNote" TEXT,
    "statusById" UUID,
    "statusAt" TIMESTAMPTZ(3),
    "reportedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BuildProblem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuildProblem_storeId_status_createdAt_idx" ON "BuildProblem"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BuildProblem_storeId_prNumber_idx" ON "BuildProblem"("storeId", "prNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BuildProblem_storeId_number_key" ON "BuildProblem"("storeId", "number");

-- AddForeignKey
ALTER TABLE "BuildProblem" ADD CONSTRAINT "BuildProblem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

