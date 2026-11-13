-- PR 685 (S28 Admin v5) — the add-product wizard remembers where a draft stopped. Additive only: one nullable column.
-- AlterTable
ALTER TABLE "Product" ADD COLUMN "draftState" JSONB;
