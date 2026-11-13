-- PR 706: Start fresh runs (S28; one place per store; additive).

-- CreateEnum
CREATE TYPE "StartFreshStatus" AS ENUM ('RUNNING', 'DONE', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "StartFreshRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "status" "StartFreshStatus" NOT NULL DEFAULT 'RUNNING',
    "backupRequestId" UUID,
    "removeProducts" BOOLEAN NOT NULL DEFAULT false,
    "kinds" JSONB NOT NULL DEFAULT '[]',
    "erpStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "detail" TEXT,
    "requestedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StartFreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StartFreshRun_storeId_createdAt_idx" ON "StartFreshRun"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "StartFreshRun" ADD CONSTRAINT "StartFreshRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One place per store: a try that is RUNNING, DONE or PARTIAL holds it, so Start fresh runs once (a FAILED try released it).
CREATE UNIQUE INDEX "StartFreshRun_one_per_store" ON "StartFreshRun"("storeId") WHERE "status" IN ('RUNNING', 'DONE', 'PARTIAL');
