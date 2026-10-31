-- PR 89 follow-up (S03, CN-018 (4), SIM-F-051, CN-031 gate): each set is a "Fixed set" (no single piece can be kept or
-- returned) or "Flexible", and a flexible set has its split-price rule. Null = the store's default in the setting
-- `combos.split` (off as shipped: today's pro-rata split stays). Only adds nullable columns; nothing existing changes.
ALTER TABLE "Combo" ADD COLUMN "splitMode" TEXT;
ALTER TABLE "Combo" ADD COLUMN "splitPriceRule" TEXT;
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_splitMode_check" CHECK ("splitMode" IS NULL OR "splitMode" IN ('FIXED', 'FLEXIBLE'));
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_splitPriceRule_check" CHECK ("splitPriceRule" IS NULL OR "splitPriceRule" IN ('PRO_RATA', 'OWN_PRICE'));
