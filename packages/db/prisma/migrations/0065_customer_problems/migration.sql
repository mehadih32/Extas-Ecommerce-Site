-- PR 423 (S21, CN-015): the customer problem recorder. CustomerProblem groups the reports with the same cause (Reports
-- › Site health › Customer problems: severity, status and its note); ProblemRecord keeps each anonymous report (a
-- random visitor id, the device, browser and network families) for counting visitors and the date view. No name,
-- phone, address or payment detail is stored. Everything here only adds; nothing is changed, renamed or dropped.

-- CreateEnum
CREATE TYPE "CustomerProblemSeverity" AS ENUM ('URGENT', 'IMPORTANT', 'CAN_WAIT');

-- CreateEnum
CREATE TYPE "CustomerProblemStatus" AS ENUM ('NEW', 'FIXING', 'FIXED', 'COULD_NOT_FIX', 'NEEDS_OWNER', 'WAITING_OWNER_CHECK');

-- CreateTable
CREATE TABLE "CustomerProblem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "severity" "CustomerProblemSeverity" NOT NULL DEFAULT 'CAN_WAIT',
    "status" "CustomerProblemStatus" NOT NULL DEFAULT 'NEW',
    "statusNote" TEXT,
    "statusById" UUID,
    "statusAt" TIMESTAMPTZ(3),
    "records" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemRecord" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "problemId" UUID NOT NULL,
    "visitorId" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "network" TEXT,
    "ms" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerProblem_storeId_status_lastSeenAt_idx" ON "CustomerProblem"("storeId", "status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProblem_storeId_fingerprint_key" ON "CustomerProblem"("storeId", "fingerprint");

-- CreateIndex
CREATE INDEX "ProblemRecord_storeId_createdAt_idx" ON "ProblemRecord"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemRecord_problemId_createdAt_idx" ON "ProblemRecord"("problemId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerProblem" ADD CONSTRAINT "CustomerProblem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemRecord" ADD CONSTRAINT "ProblemRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemRecord" ADD CONSTRAINT "ProblemRecord_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "CustomerProblem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

