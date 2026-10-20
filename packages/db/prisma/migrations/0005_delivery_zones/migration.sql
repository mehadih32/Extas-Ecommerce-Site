-- PR 549, 550 (S06, the delivery-zone engine): the gazetteer importer keeps one row per place code, so re-importing the
-- national list updates rows instead of adding copies (GeoArea.code becomes unique; existing rows have no code, and
-- PostgreSQL lets any number of NULLs through). Taking an area off the owner's sub-area list archives its AreaBand row
-- instead of deleting it (CLAUDE.md hard rule 3); adding it again brings the same row back, so the unique key
-- (storeId, areaId) stays. Only a column and an index are added: nothing is dropped, rewritten or deleted.

-- AlterTable
ALTER TABLE "AreaBand" ADD COLUMN     "archivedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "GeoArea_code_key" ON "GeoArea"("code");
