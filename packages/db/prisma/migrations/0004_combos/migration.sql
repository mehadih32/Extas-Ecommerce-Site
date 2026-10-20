-- PR 89, 90, 571, 99, 101, 96, 97, 575, 104 (S03 combo core): a combo gets its short description, the auto-apply and
-- same-colour (K11) switches, the key of a generated pair, a version for the editor and who made or changed it; a combo
-- slot can be archived and labelled; the auto colour-pair rule (the owner's model, PR 571) gets its link key, names,
-- hand-picked products, pairing, excluded colours, price mode (fixed or a share off), order, pins, season, templates,
-- the "add 1 more" rule, a version and who changed it; a product gets the "Use in combos" tick (on by default);
-- popular pairs get a colour key; and a new table counts each combo's views, adds and colour picks per day (PR 104).
-- Only types, columns, a table and indexes are added: nothing is dropped, rewritten or deleted, and every existing row
-- keeps its values (new columns are empty or take their default; an existing auto rule's new link key is its id).

-- CreateEnum
CREATE TYPE "ComboPairing" AS ENUM ('STYLE', 'ACROSS', 'ANY');

-- CreateEnum
CREATE TYPE "ComboPriceMode" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "ComboSortMode" AS ENUM ('BESTSELLERS', 'COLOUR');

-- AlterTable
ALTER TABLE "Combo" ADD COLUMN     "autoApply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "descriptionBn" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "pieceKey" TEXT,
ADD COLUMN     "sameColour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ComboAutoRule" ADD COLUMN     "bagTemplateKey" TEXT,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "excludeColourIds" UUID[],
ADD COLUMN     "key" TEXT,
ADD COLUMN     "lastGeneratedAt" TIMESTAMPTZ(3),
ADD COLUMN     "listTemplateKey" TEXT,
ADD COLUMN     "nameBn" TEXT,
ADD COLUMN     "pageTemplateKey" TEXT,
ADD COLUMN     "pairing" "ComboPairing" NOT NULL DEFAULT 'STYLE',
ADD COLUMN     "percentOff" INTEGER,
ADD COLUMN     "pinnedKeys" TEXT[],
ADD COLUMN     "priceMode" "ComboPriceMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "productIds" UUID[],
ADD COLUMN     "sameColour" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "season" TEXT,
ADD COLUMN     "sortMode" "ComboSortMode" NOT NULL DEFAULT 'BESTSELLERS',
ADD COLUMN     "titleBn" TEXT,
ADD COLUMN     "titleEn" TEXT,
ADD COLUMN     "updatedById" UUID,
ADD COLUMN     "upsellRuleId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Existing auto rules (none are written before S03) keep working: their link key is their id.
UPDATE "ComboAutoRule" SET "key" = "id"::text WHERE "key" IS NULL;
ALTER TABLE "ComboAutoRule" ALTER COLUMN "key" SET NOT NULL;

-- AlterTable
ALTER TABLE "ComboItem" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "labelBn" TEXT,
ADD COLUMN     "labelEn" TEXT;

-- AlterTable
ALTER TABLE "PopularPair" ADD COLUMN     "colourKey" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "inCombos" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ComboDailyStat" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "comboId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "adds" INTEGER NOT NULL DEFAULT 0,
    "picks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ComboDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComboDailyStat_storeId_day_idx" ON "ComboDailyStat"("storeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ComboDailyStat_comboId_day_key" ON "ComboDailyStat"("comboId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Combo_autoRuleId_pieceKey_key" ON "Combo"("autoRuleId", "pieceKey");

-- CreateIndex
CREATE INDEX "ComboAutoRule_storeId_status_idx" ON "ComboAutoRule"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ComboAutoRule_storeId_key_key" ON "ComboAutoRule"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PopularPair_comboId_colourKey_key" ON "PopularPair"("comboId", "colourKey");

-- AddForeignKey
ALTER TABLE "ComboDailyStat" ADD CONSTRAINT "ComboDailyStat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboDailyStat" ADD CONSTRAINT "ComboDailyStat_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
