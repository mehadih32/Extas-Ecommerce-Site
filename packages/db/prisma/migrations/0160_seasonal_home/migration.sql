-- PR 280 (S13) — seasonal home-page switching: each scheduled window points at the look it shows (a LayoutSnapshot),
-- keeps when it was stopped, and the home page finds the live window by store, status and start. Additive only.
ALTER TABLE "ScheduledLayoutSwitch" ADD COLUMN "stoppedAt" TIMESTAMPTZ(3);
CREATE INDEX "ScheduledLayoutSwitch_storeId_status_applyAt_idx" ON "ScheduledLayoutSwitch"("storeId", "status", "applyAt");
ALTER TABLE "ScheduledLayoutSwitch" ADD CONSTRAINT "ScheduledLayoutSwitch_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "LayoutSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
