-- PR 279 (S13) — the SEO outreach pipeline: each prospect keeps the day to follow up and the moment its link went live,
-- each site is kept once per store, and the page reads the store's live prospects by stage. Additive only.
ALTER TABLE "OutreachProspect" ADD COLUMN "nextStepAt" TIMESTAMPTZ(3);
ALTER TABLE "OutreachProspect" ADD COLUMN "liveAt" TIMESTAMPTZ(3);
CREATE INDEX "OutreachProspect_storeId_archivedAt_status_idx" ON "OutreachProspect"("storeId", "archivedAt", "status");
CREATE UNIQUE INDEX "OutreachProspect_storeId_site_key" ON "OutreachProspect"("storeId", "site");
