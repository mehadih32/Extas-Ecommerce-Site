-- PR 528: the blog brief form — a brief's search phrase, intent, outline, facts to carry, links to make, photo shot
-- list, note for the writer and last editor; one brief per topic.
ALTER TABLE "BlogBrief" ADD COLUMN "query" TEXT;
ALTER TABLE "BlogBrief" ADD COLUMN "intent" TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "BlogBrief" ADD COLUMN "outline" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BlogBrief" ADD COLUMN "mustInclude" TEXT;
ALTER TABLE "BlogBrief" ADD COLUMN "links" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BlogBrief" ADD COLUMN "shotList" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "BlogBrief" ADD COLUMN "notes" TEXT;
ALTER TABLE "BlogBrief" ADD COLUMN "updatedById" UUID;

CREATE UNIQUE INDEX "BlogBrief_storeId_topicId_key" ON "BlogBrief"("storeId", "topicId");
