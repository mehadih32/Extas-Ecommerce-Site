-- PR 592 follow-up (S12) — the journal as a full section: the expert reviewer the owner names on an article (an author
-- record, shown as "Reviewed by" with a link to their page), and the index the tag pages read by. Additive only; nothing
-- is dropped or renamed.
-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "reviewerAuthorId" UUID;

-- CreateIndex
CREATE INDEX "BlogPost_reviewerAuthorId_idx" ON "BlogPost"("reviewerAuthorId");

-- CreateIndex
CREATE INDEX "BlogPostTag_tagId_idx" ON "BlogPostTag"("tagId");

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_reviewerAuthorId_fkey" FOREIGN KEY ("reviewerAuthorId") REFERENCES "BlogAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
