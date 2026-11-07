-- PR 502 (follow-up 416): the owner's names, spellings and merges of a place as columns on GeoArea, so an import reads
-- them from the place instead of reading them back from the audit log on every run. Only adds two nullable columns and
-- a link to the place it was merged into; nothing is changed, renamed or dropped, and the audit rows stay as they are.
-- AlterTable
ALTER TABLE "GeoArea" ADD COLUMN     "mergedIntoId" UUID,
ADD COLUMN     "ownerNamedAt" TIMESTAMPTZ(3);

-- AddForeignKey
ALTER TABLE "GeoArea" ADD CONSTRAINT "GeoArea_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "GeoArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from what the owner already did (the audit rows places-admin.ts writes): the latest rename, spellings or merge
-- into the place sets ownerNamedAt; the latest merge of a place names the place it went into (when that place exists).
UPDATE "GeoArea" g SET "ownerNamedAt" = a.at
FROM (
  SELECT "entityId", max("createdAt") AS at FROM "AuditLog"
  WHERE "entityType" = 'GeoArea' AND "action" IN ('delivery.place.rename', 'delivery.place.aliases', 'delivery.place.mergeInto') AND "entityId" IS NOT NULL
  GROUP BY "entityId"
) a
WHERE g."id"::text = a."entityId";

UPDATE "GeoArea" g SET "mergedIntoId" = t."id"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "after"->>'mergedIntoId' AS into_id FROM "AuditLog"
  WHERE "entityType" = 'GeoArea' AND "action" = 'delivery.place.merge' AND "entityId" IS NOT NULL
  ORDER BY "entityId", "createdAt" DESC
) m
JOIN "GeoArea" t ON t."id"::text = m.into_id
WHERE g."id"::text = m."entityId" AND g."id" <> t."id";
