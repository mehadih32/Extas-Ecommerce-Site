-- PR 975: the product's focus keyword (the search word it should be found by). Additive only: one nullable column, no default needed.
ALTER TABLE "Product" ADD COLUMN "focusKeyword" TEXT;
