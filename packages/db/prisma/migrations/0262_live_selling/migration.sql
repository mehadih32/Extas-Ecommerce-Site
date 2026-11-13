-- PR 694 (S28, CN-048) — Inbox › Comments › Live selling: a live session with product codes, and the comments caught
-- from it. Additive only; nothing is dropped or renamed.
-- CreateTable
CREATE TABLE "LiveSession" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "channelKind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "codes" JSONB NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveCapture" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "sessionId" UUID NOT NULL,
    "commentId" TEXT,
    "commenterId" TEXT NOT NULL,
    "name" TEXT,
    "text" TEXT NOT NULL,
    "parsed" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "conversationId" UUID,
    "variantId" UUID,
    "qty" INTEGER,
    "practice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LiveCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveSession_storeId_status_startedAt_idx" ON "LiveSession"("storeId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "LiveCapture_storeId_sessionId_createdAt_idx" ON "LiveCapture"("storeId", "sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveCapture_sessionId_commentId_key" ON "LiveCapture"("sessionId", "commentId");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCapture" ADD CONSTRAINT "LiveCapture_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveCapture" ADD CONSTRAINT "LiveCapture_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
