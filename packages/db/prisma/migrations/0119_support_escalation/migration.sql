-- PR 538 (S22, Blueprint B4.14 V2 note — §59 answers 48, 49, 54; CN-031 lane C): the owner told on Telegram when a
-- customer waits and nobody answers. Additive: SupportEscalation (empty until now) gets the wait it is about, the
-- minutes waited and who answered for it, one row per wait (a second sweeper can never tell him twice), and a store's
-- rows in time order for the hourly cap. The table is locked append-only at the database like the other logs: the
-- send's outcome is a line in the chat's who-did-what log, never an edit of this row. Nothing is dropped.

-- AlterTable
ALTER TABLE "SupportEscalation" ADD COLUMN "waitingSince" TIMESTAMPTZ(3),
ADD COLUMN "minutes" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "SupportEscalation_conversationId_waitingSince_key" ON "SupportEscalation"("conversationId", "waitingSince");

-- CreateIndex
CREATE INDEX "SupportEscalation_storeId_createdAt_idx" ON "SupportEscalation"("storeId", "createdAt");

-- Append-only at the database (migration 0010's role and function): the app may add and read rows, never change them
REVOKE UPDATE, DELETE, TRUNCATE ON "SupportEscalation" FROM extas_app;
CREATE TRIGGER "SupportEscalation_append_only" BEFORE UPDATE OR DELETE ON "SupportEscalation" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "SupportEscalation_no_truncate" BEFORE TRUNCATE ON "SupportEscalation" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
