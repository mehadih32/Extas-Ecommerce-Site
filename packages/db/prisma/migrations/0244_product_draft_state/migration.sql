-- S28 · PR 685 — the add-product wizard remembers where a draft stopped. Additive only: one nullable column.
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "draftState" JSONB;
