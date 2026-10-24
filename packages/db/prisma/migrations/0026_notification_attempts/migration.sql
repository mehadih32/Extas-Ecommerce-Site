-- PR 149 (S05; BACKEND-ARCHITECTURE §8.8): the notification log with retries. Every try at sending a message is one
-- NotificationAttempt row: the sender (provider, mode), the result, the provider's message id and cost, and the staff
-- member who asked for it when a failed message was retried by hand. A retry is a new row; rows are never changed.
-- Like the audit log (0010_append_only), the table is append-only at the database: the app role may only INSERT and
-- SELECT, and a trigger refuses UPDATE, DELETE and TRUNCATE for everybody. Nothing is dropped or removed here.

-- CreateTable
CREATE TABLE "NotificationAttempt" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "notificationLogId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "provider" TEXT,
    "mode" "AdapterMode",
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    "providerMessageId" TEXT,
    "costMinor" INTEGER,
    "retriedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationAttempt_storeId_createdAt_idx" ON "NotificationAttempt"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationAttempt_notificationLogId_attempt_key" ON "NotificationAttempt"("notificationLogId", "attempt");

-- AddForeignKey
ALTER TABLE "NotificationAttempt" ADD CONSTRAINT "NotificationAttempt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAttempt" ADD CONSTRAINT "NotificationAttempt_notificationLogId_fkey" FOREIGN KEY ("notificationLogId") REFERENCES "NotificationLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NotificationAttempt (PR 149): every try at sending a message, with its result.
REVOKE UPDATE, DELETE, TRUNCATE ON "NotificationAttempt" FROM extas_app;
CREATE TRIGGER "NotificationAttempt_append_only" BEFORE UPDATE OR DELETE ON "NotificationAttempt" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "NotificationAttempt_no_truncate" BEFORE TRUNCATE ON "NotificationAttempt" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
