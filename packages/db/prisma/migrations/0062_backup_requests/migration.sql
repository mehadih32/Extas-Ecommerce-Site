-- PR 507 (S19, CN-030): the backups and restore drills asked for in the admin (Settings › System › Backups). The
-- server's vault sync takes a QUEUED request, runs it on the server and writes the outcome back. A row is never
-- deleted. Everything here only adds; nothing is changed, renamed or dropped.

-- CreateEnum
CREATE TYPE "BackupRequestKind" AS ENUM ('BACKUP', 'RESTORE_DRILL');

-- CreateTable
CREATE TABLE "BackupRequest" (
    "id" UUID NOT NULL,
    "kind" "BackupRequestKind" NOT NULL,
    "source" TEXT,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "detail" TEXT,
    "requestedById" UUID,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BackupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRequest_status_createdAt_idx" ON "BackupRequest"("status", "createdAt");

-- One queued or running request of each kind at a time (a double tap, or two admins at once: the second is refused).
-- Partial (the Prisma schema cannot say "WHERE"), so it lives here only.
CREATE UNIQUE INDEX "BackupRequest_kind_open_key" ON "BackupRequest"("kind") WHERE "status" IN ('QUEUED', 'RUNNING');
