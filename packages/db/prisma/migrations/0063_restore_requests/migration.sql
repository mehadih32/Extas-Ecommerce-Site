-- PR 396 (S19, CN-030): restoring from the admin (Settings › System › Backups › Restore): staging first, then the
-- same backup on the live shop with RESTORE typed and the owner's PIN. The server's vault sync takes a QUEUED request,
-- runs it and writes the outcome back. A row is never deleted. Everything here only adds; nothing is changed, renamed
-- or dropped.

-- AlterTable
ALTER TABLE "RestoreRequest" ADD COLUMN "source" TEXT,
ADD COLUMN "backup" TEXT,
ADD COLUMN "detail" TEXT,
ADD COLUMN "stagingOfId" UUID;

-- CreateIndex
CREATE INDEX "RestoreRequest_status_createdAt_idx" ON "RestoreRequest"("status", "createdAt");

-- One queued or running restore at a time (a double tap, or two admins at once: the second is refused). Partial (the
-- Prisma schema cannot say "WHERE"), so it lives here only.
CREATE UNIQUE INDEX "RestoreRequest_open_key" ON "RestoreRequest"((true)) WHERE "status" IN ('QUEUED', 'RUNNING');
