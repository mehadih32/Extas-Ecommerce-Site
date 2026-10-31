-- PR 117 follow-up (S04, CN-020 (4), SIM-F-047, CN-031 gate): the address spoken into the checkout's mic. One row per
-- recording: the words read (by the phone's own speech engine, or by the speech-to-text connection on the server —
-- its mock until the key is in), how sure the reader was, and the recording itself when the owner keeps it (a library
-- file). The order it went into is set when the order is placed (it is marked "voice-entered"; an unsure reading is
-- flagged "voice — please call"). Off as shipped (`checkout.voice`). Only adds one table, its indexes and the
-- connection kind SPEECH (its own kind, so it never stands in for the AI writer or the page reader).

ALTER TYPE "IntegrationKind" ADD VALUE IF NOT EXISTS 'SPEECH';

-- CreateTable
CREATE TABLE "CheckoutVoice" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "visitorId" TEXT NOT NULL,
    "orderId" UUID,
    "assetId" UUID,
    "transcript" TEXT,
    "confidence" DOUBLE PRECISION,
    "engine" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheckoutVoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CheckoutVoice_engine_check" CHECK ("engine" IN ('BROWSER', 'SERVER', 'NONE')),
    CONSTRAINT "CheckoutVoice_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

-- CreateIndex
CREATE INDEX "CheckoutVoice_storeId_visitorId_createdAt_idx" ON "CheckoutVoice"("storeId", "visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckoutVoice_orderId_idx" ON "CheckoutVoice"("orderId");

-- AddForeignKey
ALTER TABLE "CheckoutVoice" ADD CONSTRAINT "CheckoutVoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
