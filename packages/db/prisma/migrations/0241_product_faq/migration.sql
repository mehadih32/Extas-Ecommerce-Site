-- PR 682 (S28 Admin v5) — product, category and shop-wide FAQs. Additive only: a new table and enum; nothing is dropped or renamed.
-- CreateEnum
CREATE TYPE "FaqScope" AS ENUM ('PRODUCT', 'CATEGORY', 'SHOP');

-- CreateTable
CREATE TABLE "ProductFaq" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "scope" "FaqScope" NOT NULL,
    "productId" UUID,
    "categoryId" UUID,
    "questionEn" TEXT NOT NULL,
    "questionBn" TEXT,
    "answerEn" TEXT NOT NULL,
    "answerBn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceQuestionId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductFaq_storeId_scope_productId_idx" ON "ProductFaq"("storeId", "scope", "productId");

-- CreateIndex
CREATE INDEX "ProductFaq_storeId_scope_categoryId_idx" ON "ProductFaq"("storeId", "scope", "categoryId");

-- AddForeignKey
ALTER TABLE "ProductFaq" ADD CONSTRAINT "ProductFaq_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
