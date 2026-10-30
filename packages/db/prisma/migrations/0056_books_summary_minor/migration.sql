-- PR 617 (CN-028, CN-029 Phase 1; qa-gate): each daily summary version keeps its exact lines in minor units beside the
-- whole-taka body it sent (`minorLines`: salesGross, salesDiscounts, salesNet, deliveryCharges, goods, returnLosses and
-- each cost line). The books match (PR 616, check B) ties the day with these, never with the rounded body, so a piece at
-- 450.50 ties to the paisa. Empty on a version built before this column. Everything here only adds.

-- AlterTable
ALTER TABLE "ErpDailySummary" ADD COLUMN     "minorLines" JSONB;
