-- PR 692 (S28, CN-048) — Inbox › Quick replies. A short name with an English and a Bengali text; archived, never
-- deleted. Additive only; nothing is dropped or renamed.
-- CreateTable
CREATE TABLE "SupportSavedReply" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "shortcut" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyBn" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportSavedReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportSavedReply_storeId_archivedAt_idx" ON "SupportSavedReply"("storeId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportSavedReply_storeId_shortcut_key" ON "SupportSavedReply"("storeId", "shortcut");

-- AddForeignKey
ALTER TABLE "SupportSavedReply" ADD CONSTRAINT "SupportSavedReply_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
