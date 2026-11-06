-- PR 278 (S13) — the YouTube module: a video can be set aside (archived) instead of deleted, and the list reads only
-- the store's live videos. Additive only.
ALTER TABLE "YoutubeVideo" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
CREATE INDEX "YoutubeVideo_storeId_archivedAt_idx" ON "YoutubeVideo"("storeId", "archivedAt");
