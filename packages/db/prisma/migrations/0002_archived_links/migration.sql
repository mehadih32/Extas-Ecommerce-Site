-- PR 27, 32 (CLAUDE.md hard rule 3, "nothing is deleted"): taking a size chart, a collection or a tag off a product
-- archives the link instead of deleting the row. Re-linking brings the same row back, so the existing unique keys
-- (CollectionProduct collectionId+productId, ProductTag tagId+productId) stay as they are. Only columns are added:
-- nothing is dropped, rewritten or deleted, and every existing link stays live (archivedAt is NULL).

-- AlterTable
ALTER TABLE "SizeChartAssignment" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CollectionProduct" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ProductTag" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);
