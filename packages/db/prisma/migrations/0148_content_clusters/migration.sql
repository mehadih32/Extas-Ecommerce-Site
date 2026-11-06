-- PR 242: the topical cluster planner — a cluster's Bengali name, journal category, the shop page its articles link to
-- and its place; a planned topic's cluster, language, search phrase, priority, pillar flag, writer, article, proposer
-- and decision time.
ALTER TABLE "ContentCluster" ADD COLUMN "nameBn" TEXT;
ALTER TABLE "ContentCluster" ADD COLUMN "categoryId" UUID;
ALTER TABLE "ContentCluster" ADD COLUMN "targetPath" TEXT;
ALTER TABLE "ContentCluster" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "BlogTopic" ADD COLUMN "clusterId" UUID;
ALTER TABLE "BlogTopic" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "BlogTopic" ADD COLUMN "query" TEXT;
ALTER TABLE "BlogTopic" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 2;
-- Existing topics start at 2 (normal); new ones always get it from the topic form, so the default goes again.
ALTER TABLE "BlogTopic" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "BlogTopic" ADD COLUMN "isPillar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BlogTopic" ADD COLUMN "authorId" UUID;
ALTER TABLE "BlogTopic" ADD COLUMN "postId" UUID;
ALTER TABLE "BlogTopic" ADD COLUMN "proposedById" UUID;
ALTER TABLE "BlogTopic" ADD COLUMN "decidedAt" TIMESTAMPTZ(3);

CREATE INDEX "BlogTopic_storeId_clusterId_idx" ON "BlogTopic"("storeId", "clusterId");
