-- PR 6 (S0A, CN-022 · 23 Oct 2026): the background worker. Every attempt of a job is one JobRun row that the worker
-- opens (RUNNING) and closes once: SUCCEEDED, FAILED with the reason and the next attempt, DEAD_LETTERED after the last
-- try, or SKIPPED when the same run (its idempotency key) already succeeded, so a retry never repeats a side effect.
-- JobRun therefore gains `updatedAt` and is no longer marked append-only; rows are still never deleted. Each worker
-- process keeps its heartbeat in WorkerHeartbeat (the Server page says "stale" when the newest beat is too old).
-- Only columns, a table, indexes and an enum value are added: nothing is dropped, rewritten or deleted. Existing
-- JobRun rows (if any) get their own id as the idempotency key and their finish (or start) time as `updatedAt`.

-- AlterEnum
ALTER TYPE "JobRunStatus" ADD VALUE 'SKIPPED';

-- AlterTable
ALTER TABLE "JobRun" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextAttemptAt" TIMESTAMPTZ(3),
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "queueJobId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "workerKey" TEXT;
UPDATE "JobRun" SET "idempotencyKey" = "id"::text WHERE "idempotencyKey" IS NULL;
UPDATE "JobRun" SET "updatedAt" = COALESCE("finishedAt", "startedAt") WHERE "updatedAt" IS NULL;
ALTER TABLE "JobRun" ALTER COLUMN "idempotencyKey" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" UUID NOT NULL,
    "workerKey" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "version" TEXT,
    "color" TEXT,
    "queues" TEXT[],
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "activeJobs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "beatAt" TIMESTAMPTZ(3) NOT NULL,
    "stoppedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerHeartbeat_workerKey_key" ON "WorkerHeartbeat"("workerKey");

-- CreateIndex
CREATE INDEX "WorkerHeartbeat_beatAt_idx" ON "WorkerHeartbeat"("beatAt");

-- CreateIndex
CREATE INDEX "JobRun_idempotencyKey_startedAt_idx" ON "JobRun"("idempotencyKey", "startedAt");
