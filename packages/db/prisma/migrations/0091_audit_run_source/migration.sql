-- PR 419 (S21, B7.3): every smoke test and saved-journeys run is kept in SiteAuditRun with its findings. A run is
-- written once: `sourceKey` names it (the tool, when it ran, which kind and which version), so the server's import
-- and the admin's catch-up never keep it twice. Findings are read run by run. Only adds; nothing is changed or dropped.
ALTER TABLE "SiteAuditRun" ADD COLUMN "sourceKey" TEXT;
CREATE UNIQUE INDEX "SiteAuditRun_storeId_sourceKey_key" ON "SiteAuditRun"("storeId", "sourceKey");
CREATE INDEX "SiteAuditFinding_runId_idx" ON "SiteAuditFinding"("runId");
