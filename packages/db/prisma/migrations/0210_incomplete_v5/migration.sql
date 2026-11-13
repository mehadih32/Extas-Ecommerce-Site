-- S28 · PR 668 (Admin v5, Orders › Incomplete orders): the recovered-by-phone mark on a draft (who and when), the "Possible match" flag for the same connection as an earlier customer (never attached), and the call log (one row per call and what it found, append-only). Additive only; nothing is dropped, renamed or retyped.
-- AlterTable
ALTER TABLE "CheckoutDraft" ADD COLUMN     "possibleMatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "possibleMatchCustomerId" UUID,
ADD COLUMN     "recoveredAt" TIMESTAMPTZ(3),
ADD COLUMN     "recoveredById" UUID;

-- CreateTable
CREATE TABLE "CheckoutDraftCall" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "draftId" UUID NOT NULL,
    "byId" UUID,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutDraftCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckoutDraftCall_storeId_draftId_createdAt_idx" ON "CheckoutDraftCall"("storeId", "draftId", "createdAt");

-- AddForeignKey
ALTER TABLE "CheckoutDraftCall" ADD CONSTRAINT "CheckoutDraftCall_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutDraftCall" ADD CONSTRAINT "CheckoutDraftCall_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "CheckoutDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

