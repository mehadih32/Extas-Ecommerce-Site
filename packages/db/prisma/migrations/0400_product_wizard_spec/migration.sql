-- PR 1030 (S28; admin prototype v5, Add product wizard): the wizard's own answers on a draft product. One new table, nothing else is changed, dropped or rewritten.

-- CreateTable
CREATE TABLE "ProductWizardSpec" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "kind" TEXT,
    "bottomProductId" UUID,
    "colourLink" TEXT,
    "forWho" TEXT,
    "details" JSONB,
    "keyPoints" TEXT,
    "fit" TEXT,
    "sizesRun" TEXT,
    "modelHeight" TEXT,
    "modelWeightKg" INTEGER,
    "modelWears" TEXT,
    "hiddenSizeIds" JSONB,
    "hiddenColourIds" JSONB,
    "finder" JSONB,
    "bGrade" BOOLEAN NOT NULL DEFAULT false,
    "scheduleAt" TIMESTAMPTZ(3),
    "hideDemo" BOOLEAN,
    "priceConfirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductWizardSpec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductWizardSpec_storeId_productId_key" ON "ProductWizardSpec"("storeId", "productId");

-- AddForeignKey
ALTER TABLE "ProductWizardSpec" ADD CONSTRAINT "ProductWizardSpec_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PR 1032 (add-product wizard, step 3): the colour's name on one product's page (null = the colour list's own name).
ALTER TABLE "ProductColour" ADD COLUMN "siteNameEn" TEXT;
ALTER TABLE "ProductColour" ADD COLUMN "siteNameBn" TEXT;
