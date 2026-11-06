-- PR 239: the journal's articles — a category's introduction, and on a post its search description, focus keyword,
-- one-line answer, main photo, the products its product block shows and the staff member who wrote it.
ALTER TABLE "BlogCategory" ADD COLUMN "introEn" TEXT;
ALTER TABLE "BlogCategory" ADD COLUMN "introBn" TEXT;

ALTER TABLE "BlogPost" ADD COLUMN "metaDescription" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "focusKeyword" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "quickAnswer" TEXT;
ALTER TABLE "BlogPost" ADD COLUMN "heroAssetId" UUID;
ALTER TABLE "BlogPost" ADD COLUMN "productIds" UUID[];
ALTER TABLE "BlogPost" ADD COLUMN "writerStaffId" UUID;
