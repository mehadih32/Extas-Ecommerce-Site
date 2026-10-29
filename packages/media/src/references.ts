// PR 37 — where a file is used. A file is "in use" when any row of the schema points at it (a product gallery, a
// category image, a combo set photo, a review, a chat attachment, a generated invoice …) or a MEDIA_REF setting holds
// it (the logo). The list below is checked against the schema by a test: a new `…AssetId` column fails the build
// until it is listed here, so the orphan clean-up can never miss a use.
//
// Only an active product link counts (an archived ProductMedia row is a photo taken off a product). Every other row
// counts whatever its state: when in doubt, a file stays.
import { Prisma } from '@extas/db/client';
import { registry } from '@extas/settings';
import type { Db } from './deps';

export interface MediaReference {
  model: string;
  field: string;
  list: boolean;
  /** Extra SQL condition on the row (static text, never user input). */
  where?: string;
}

const ref = (model: string, field: string, list = false, where?: string): MediaReference => ({ model, field, list, ...(where ? { where } : {}) });

export const MEDIA_REFERENCES: readonly MediaReference[] = [
  ref('Brand', 'logoAssetId'),
  ref('Category', 'imageAssetId'),
  ref('Colour', 'trueColourAssetId'),
  ref('ProductColour', 'trueColourAssetId'),
  ref('MediaAsset', 'sourceAssetId'),
  ref('ProductMedia', 'assetId', false, '"archivedAt" IS NULL'),
  ref('CatalogImportJob', 'fileAssetId'),
  ref('ReviewMedia', 'assetId'),
  ref('Combo', 'setPhotoAssetId'),
  ref('GatewayStatement', 'fileAssetId'),
  ref('Exchange', 'photoAssetIds', true),
  ref('ReturnItem', 'photoAssetIds', true),
  ref('PackingPhoto', 'mediaAssetId'),
  ref('SeoMeta', 'ogImageAssetId'),
  ref('SitemapBuild', 'fileAssetId'),
  ref('BlogAuthor', 'avatarAssetId'),
  ref('HouseAd', 'creativeAssetId'),
  ref('ImageSourcingRequest', 'assetId'),
  ref('CompetitorReport', 'reportAssetId'),
  ref('LegacyImport', 'fileAssetId'),
  ref('ExportJob', 'fileAssetId'),
  ref('GeneratedDocument', 'assetId'),
  ref('SiteAuditRun', 'reportAssetId'),
  ref('MessageAttachment', 'assetId'),
  ref('MessageAttachment', 'thumbnailAssetId'),
  ref('SocialPost', 'mediaAssetIds', true),
  ref('SocialRenderJob', 'outputAssetId'),
  ref('StudioModelAsset', 'assetId'),
  ref('ModelConsent', 'documentAssetId'),
  ref('StudioScene', 'assetId'),
  ref('PhotoshootJob', 'inputAssetIds', true),
  ref('PhotoshootOutput', 'assetId'),
  ref('ImageEdit', 'sourceAssetId'),
  ref('ImageEdit', 'resultAssetId'),
  ref('DetailRegion', 'assetId'),
  ref('ColourVerification', 'assetId'),
  ref('VideoJob', 'sourceAssetId'),
  ref('VideoJob', 'outputAssetId'),
  ref('Reel', 'musicAssetId'),
  ref('Reel', 'outputAssetIds', true),
  ref('CreativeExport', 'outputAssetIds', true),
];

/** Fields that hold a file id but are part of the file itself, not a use of it. */
export const NOT_A_USE: readonly string[] = ['MediaRendition.assetId'];

/** Setting keys whose value is a file id (the logo …). */
export const MEDIA_REF_SETTINGS: readonly string[] = Object.entries(registry)
  .filter(([, spec]) => spec.valueType === 'MEDIA_REF')
  .map(([k]) => k);

const ident = (s: string) => {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(s)) throw new Error(`not a plain identifier: ${s}`);
  return `"${s}"`;
};

export interface Use {
  /** `Model.field` or `setting:<key>`. */
  where: string;
  count: number;
}

/** For each id: where it is used. Ids not in the map are used nowhere. */
export async function findUses(db: Db, assetIds: readonly string[]): Promise<Map<string, Use[]>> {
  const out = new Map<string, Use[]>();
  if (!assetIds.length) return out;
  const ids = [...new Set(assetIds)];
  const add = (id: string, where: string, count: number) => {
    const list = out.get(id) ?? [];
    list.push({ where, count });
    out.set(id, list);
  };
  for (const r of MEDIA_REFERENCES) {
    const t = ident(r.model);
    const f = ident(r.field);
    const extra = r.where ? ` AND ${r.where}` : '';
    const sql = r.list
      ? `SELECT u::text AS id, count(*)::int AS n FROM ${t}, unnest(${t}.${f}) AS u WHERE u = ANY($1::uuid[])${extra} GROUP BY u`
      : `SELECT ${f}::text AS id, count(*)::int AS n FROM ${t} WHERE ${f} = ANY($1::uuid[])${extra} GROUP BY ${f}`;
    const rows = await db.$queryRawUnsafe<{ id: string; n: number }[]>(sql, ids);
    for (const row of rows) add(row.id, `${r.model}.${r.field}`, row.n);
  }
  if (MEDIA_REF_SETTINGS.length) {
    const rows = await db.$queryRaw<{ id: string; key: string; n: number }[]>(Prisma.sql`
      SELECT v.value #>> '{}' AS id, v.key, count(*)::int AS n FROM (
        SELECT key, value FROM "InstallationSettingValue" WHERE key IN (${Prisma.join(MEDIA_REF_SETTINGS)})
        UNION ALL
        SELECT key, value FROM "StoreSettingValue" WHERE key IN (${Prisma.join(MEDIA_REF_SETTINGS)})
      ) v WHERE jsonb_typeof(v.value) = 'string' AND v.value #>> '{}' IN (${Prisma.join(ids)})
      GROUP BY 1, 2`);
    for (const row of rows) add(row.id, `setting:${row.key}`, row.n);
  }
  return out;
}
