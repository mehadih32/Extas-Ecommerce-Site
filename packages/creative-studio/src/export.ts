// S25 · PR 487 (Blueprint C8.5, C8.6 item 7) — campaign creative export, part 1: the selection step. From a
// campaign the owner picks a product, a SKU (variant), or a whole category, names the platform sizes he wants and
// whether a price/offer overlay should be pulled from the campaign; this gathers the already-approved product
// photos that selection covers and sits the export as a `DRAFT` `CreativeExport` row. While `studio.creativeExport`
// is off (CN-018: off by default) every request is refused with `OFF`.
//
// S25 · PR 488 (Blueprint C8.5, C8.6 item 8) — part 2: `queueCreativeExport`/`runCreativeExport` move a `DRAFT`
// export through `QUEUED` to `APPROVED`, re-gathering the selection's live approved photos at run time
// (`SELECTION_EMPTY` again if nothing still qualifies) as the export's `outputAssetIds` — an honest preview (the
// already-approved photos themselves, exactly as PR 439/440's render engine and PR 482's mock video provider do),
// since no real per-size crop/overlay compositor is connected yet. From `APPROVED`, `sendCreativeExportToAdAccount`
// records (practice only — no adapter method exists yet to push a creative to a real ad account) that the owner
// sent it to a connected `AdAccount` of this store, and `markCreativeExportDownloaded` records that he downloaded
// it instead (the asset ids are fetched through the existing `/api/media/<id>/download` route); either move lands
// on `PUBLISHED` once — Blueprint C8.5's "one click sends them to the connected ad account or downloads them".
import { z } from 'zod';
import type { PrismaClient } from '@extas/db/client';
import { audit } from '@extas/auth';
import { StudioError } from './errors';
import type { StudioDeps, Who } from './context';

/** Blueprint C8.5: "every platform size" — Meta 1:1/4:5/9:16, Google 1.91:1, TikTok 9:16. */
export const CREATIVE_EXPORT_SIZES = ['meta_1_1', 'meta_4_5', 'meta_9_16', 'google_1_91_1', 'tiktok_9_16'] as const;
export type CreativeExportSize = (typeof CREATIVE_EXPORT_SIZES)[number];

const selectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('product'), productId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('sku'), skuId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('category'), categoryId: z.string().uuid() }).strict(),
]);
export type CreativeExportSelection = z.infer<typeof selectionSchema>;

export const requestCreativeExportInput = z
  .object({
    /** Optional — an export may also be prepared ahead of any campaign existing. */
    campaignId: z.string().uuid().nullish(),
    selection: selectionSchema,
    sizes: z.array(z.enum(CREATIVE_EXPORT_SIZES)).min(1),
    /** Blueprint C8.5: "optional price or offer overlay pulled from the campaign itself". */
    withOverlay: z.boolean().default(false),
    /** Blueprint C8.5: "the tracked landing URL". */
    landingUrl: z.string().url().nullish(),
  })
  .strict();
export type RequestCreativeExportInput = z.infer<typeof requestCreativeExportInput>;

export interface CreativeExportView {
  id: string;
  campaignId: string | null;
  briefId: string | null;
  selection: CreativeExportSelection;
  sizes: CreativeExportSize[];
  withOverlay: boolean;
  landingUrl: string | null;
  outputAssetIds: string[];
  sentToAdAccountId: string | null;
  status: string;
  productCount: number;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  campaignId: string | null;
  briefId: string | null;
  selection: unknown;
  sizes: string[];
  withOverlay: boolean;
  landingUrl: string | null;
  outputAssetIds: string[];
  sentToAdAccountId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function view(r: Row, counts: { productCount: number; assetCount: number }): CreativeExportView {
  return {
    id: r.id,
    campaignId: r.campaignId,
    briefId: r.briefId,
    selection: r.selection as CreativeExportSelection,
    sizes: r.sizes as CreativeExportSize[],
    withOverlay: r.withOverlay,
    landingUrl: r.landingUrl,
    outputAssetIds: r.outputAssetIds,
    sentToAdAccountId: r.sentToAdAccountId,
    status: r.status,
    productCount: counts.productCount,
    assetCount: counts.assetCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * The live products a selection covers (Blueprint C8.5: "a product, a SKU, or a whole category/sub-category") —
 * never archived, store-scoped. A `sku` selection resolves to the one product that variant belongs to.
 */
async function productIdsFor(db: PrismaClient, storeId: number, selection: CreativeExportSelection): Promise<string[]> {
  if (selection.kind === 'product') {
    const p = await db.product.findFirst({ where: { id: selection.productId, storeId, archivedAt: null }, select: { id: true } });
    return p ? [p.id] : [];
  }
  if (selection.kind === 'sku') {
    const variant = await db.productVariant.findFirst({ where: { id: selection.skuId, storeId, archivedAt: null }, select: { productId: true } });
    if (!variant) return [];
    const p = await db.product.findFirst({ where: { id: variant.productId, storeId, archivedAt: null }, select: { id: true } });
    return p ? [p.id] : [];
  }
  const category = await db.category.findFirst({ where: { id: selection.categoryId, storeId, archivedAt: null }, select: { id: true } });
  if (!category) return [];
  const rows = await db.product.findMany({ where: { storeId, categoryId: selection.categoryId, archivedAt: null }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Every already-approved live photo (`isPrimary` or not) of the given products — never an unapproved or archived one. */
async function approvedAssetIds(db: PrismaClient, storeId: number, productIds: string[]): Promise<string[]> {
  if (!productIds.length) return [];
  const rows = await db.productMedia.findMany({
    where: { storeId, productId: { in: productIds }, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
    select: { assetId: true },
    distinct: ['assetId'],
  });
  return rows.map((r) => r.assetId);
}

/**
 * What a selection resolves to right now, before anything is requested: how many live products it covers and how
 * many of their already-approved photos would go into the export. Never writes anything (mirrors `estimateVideoJob`
 * — a preview, not a commitment).
 */
export async function previewCreativeExportSelection(deps: StudioDeps, storeId: number, selectionInput: unknown): Promise<{ productCount: number; assetCount: number }> {
  const ok = selectionSchema.safeParse(selectionInput);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'pick a product, a SKU or a category', ['selection']);
  const productIds = await productIdsFor(deps.db, storeId, ok.data);
  const assetIds = await approvedAssetIds(deps.db, storeId, productIds);
  return { productCount: productIds.length, assetCount: assetIds.length };
}

/** Every creative export of the store, newest first (`marketing.studio.read`, checked by the caller). */
export async function listCreativeExports(deps: StudioDeps, storeId: number): Promise<CreativeExportView[]> {
  const rows = await deps.db.creativeExport.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  return Promise.all(
    rows.map(async (r) => {
      const productIds = await productIdsFor(deps.db, storeId, r.selection as CreativeExportSelection).catch(() => []);
      return view(r, { productCount: productIds.length, assetCount: r.outputAssetIds.length || (await approvedAssetIds(deps.db, storeId, productIds)).length });
    }),
  );
}

/**
 * Prepares an export (`marketing.studio.write`, checked by the caller): refuses `OFF` while
 * `studio.creativeExport.enabled` is off, `NOT_FOUND` for a `campaignId` that names no campaign of this store, and
 * `SELECTION_EMPTY` when the selection resolves to no live product or no approved photo yet. The row sits `DRAFT`
 * with nothing composed — part 2 (PR 488) turns it into real per-size files.
 */
export async function requestCreativeExport(deps: StudioDeps, who: Who, input: unknown): Promise<CreativeExportView> {
  const ok = requestCreativeExportInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'check the selection, sizes and landing URL', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  if (!deps.settings) throw new StudioError('OFF', 'the campaign creative export is off');
  const setting = await deps.settings.value('studio.creativeExport', { storeId: who.storeId });
  if (!setting.enabled) throw new StudioError('OFF', 'the campaign creative export is off — turn it on in Settings first');

  if (d.campaignId) {
    const campaign = await deps.db.campaign.findFirst({ where: { id: d.campaignId, storeId: who.storeId, archivedAt: null }, select: { id: true } });
    if (!campaign) throw new StudioError('NOT_FOUND', 'no such campaign', ['campaignId']);
  }

  const productIds = await productIdsFor(deps.db, who.storeId, d.selection);
  if (!productIds.length) throw new StudioError('SELECTION_EMPTY', 'this selection names no live product', ['selection']);
  const assetIds = await approvedAssetIds(deps.db, who.storeId, productIds);
  if (!assetIds.length) throw new StudioError('SELECTION_EMPTY', 'none of this selection has an approved photo yet', ['selection']);

  const row = await deps.db.creativeExport.create({
    data: {
      storeId: who.storeId,
      campaignId: d.campaignId ?? null,
      selection: d.selection,
      sizes: d.sizes,
      withOverlay: d.withOverlay,
      landingUrl: d.landingUrl ?? null,
      outputAssetIds: [],
      status: 'DRAFT',
    },
  });
  await audit(
    deps.db,
    who.actor,
    { storeId: who.storeId, action: 'studio.export.request', entityType: 'CreativeExport', entityId: row.id, after: { selection: d.selection, sizes: d.sizes, productCount: productIds.length, assetCount: assetIds.length } },
    who.ctx,
  );
  return view(row, { productCount: productIds.length, assetCount: assetIds.length });
}

/** Sets aside a `DRAFT` export that is no longer wanted (`marketing.studio.write`); never a hard delete. */
export async function archiveCreativeExport(deps: StudioDeps, who: Who, exportId: string): Promise<CreativeExportView> {
  const job = await deps.db.creativeExport.findFirst({ where: { id: exportId, storeId: who.storeId } });
  if (!job) throw new StudioError('NOT_FOUND', 'no such export', ['exportId']);
  if (job.status !== 'DRAFT') throw new StudioError('WRONG_STATE', 'only a waiting export can be set aside', ['status']);
  const row = await deps.db.creativeExport.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
  const productIds = await productIdsFor(deps.db, who.storeId, row.selection as CreativeExportSelection).catch(() => []);
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.export.cancel', entityType: 'CreativeExport', entityId: job.id, before: { status: job.status }, after: { status: row.status } }, who.ctx);
  return view(row, { productCount: productIds.length, assetCount: row.outputAssetIds.length });
}

async function findOwnExport(db: PrismaClient, storeId: number, exportId: string) {
  const job = await db.creativeExport.findFirst({ where: { id: exportId, storeId } });
  if (!job) throw new StudioError('NOT_FOUND', 'no such export', ['exportId']);
  return job;
}

/** Moves a requested export from `DRAFT` to `QUEUED` (`marketing.studio.write`, checked by the caller). */
export async function queueCreativeExport(deps: StudioDeps, who: Who, exportId: string): Promise<CreativeExportView> {
  const job = await findOwnExport(deps.db, who.storeId, exportId);
  if (job.status !== 'DRAFT') throw new StudioError('WRONG_STATE', 'only a waiting export can be queued', ['status']);
  const row = await deps.db.creativeExport.update({ where: { id: job.id }, data: { status: 'QUEUED' } });
  const productIds = await productIdsFor(deps.db, who.storeId, row.selection as CreativeExportSelection).catch(() => []);
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.export.queue', entityType: 'CreativeExport', entityId: job.id, before: { status: job.status }, after: { status: row.status } }, who.ctx);
  return view(row, { productCount: productIds.length, assetCount: row.outputAssetIds.length });
}

/**
 * Runs one `QUEUED` export (`marketing.studio.write`, checked by the caller): re-gathers the selection's live
 * approved photos as `outputAssetIds` — an honest preview (the approved photos themselves, exactly as PR 439/440's
 * render engine and PR 482's mock video provider do), since no real per-size crop/overlay compositor is connected
 * yet — and lands on `APPROVED`. Refuses `SELECTION_EMPTY` if nothing still qualifies (a product unpublished or a
 * photo archived since the export was prepared).
 */
export async function runCreativeExport(deps: StudioDeps, who: Who, exportId: string): Promise<CreativeExportView> {
  const job = await findOwnExport(deps.db, who.storeId, exportId);
  if (job.status !== 'QUEUED') throw new StudioError('WRONG_STATE', 'only a queued export can be run', ['status']);
  const productIds = await productIdsFor(deps.db, who.storeId, job.selection as CreativeExportSelection);
  const assetIds = await approvedAssetIds(deps.db, who.storeId, productIds);
  if (!assetIds.length) throw new StudioError('SELECTION_EMPTY', 'none of this selection has an approved photo any more', ['selection']);
  const row = await deps.db.creativeExport.update({ where: { id: job.id }, data: { status: 'APPROVED', outputAssetIds: assetIds } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.export.run', entityType: 'CreativeExport', entityId: job.id, before: { status: job.status }, after: { status: row.status, assetCount: assetIds.length } }, who.ctx);
  return view(row, { productCount: productIds.length, assetCount: assetIds.length });
}

/**
 * Sends an `APPROVED` export to a connected `AdAccount` of this store (`marketing.studio.approve`, checked by the
 * caller — Blueprint C8.5's "one click sends them to the connected ad account"). No adapter method exists yet to
 * push a creative file to a real ad platform, so this records the intent only (practice, audited) — the same
 * "practice copies only until the real call exists" honesty the rest of the ads module keeps (S13 PR 259–261, 268).
 */
export async function sendCreativeExportToAdAccount(deps: StudioDeps, who: Who, exportId: string, adAccountId: string): Promise<CreativeExportView> {
  const job = await findOwnExport(deps.db, who.storeId, exportId);
  if (job.status !== 'APPROVED') throw new StudioError('WRONG_STATE', 'only an export ready to go out can be sent', ['status']);
  const account = await deps.db.adAccount.findFirst({ where: { id: adAccountId, storeId: who.storeId }, select: { id: true } });
  if (!account) throw new StudioError('NOT_FOUND', 'no such ad account', ['adAccountId']);
  const row = await deps.db.creativeExport.update({ where: { id: job.id }, data: { status: 'PUBLISHED', sentToAdAccountId: account.id } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.export.send', entityType: 'CreativeExport', entityId: job.id, before: { status: job.status }, after: { status: row.status, sentToAdAccountId: account.id } }, who.ctx);
  const productIds = await productIdsFor(deps.db, who.storeId, row.selection as CreativeExportSelection).catch(() => []);
  return view(row, { productCount: productIds.length, assetCount: row.outputAssetIds.length });
}

/**
 * Records that an `APPROVED` export was downloaded instead of sent (`marketing.studio.write`) — Blueprint C8.5's
 * "…or downloads them". The files themselves are the export's own `outputAssetIds`, each fetched through the
 * existing `/api/media/<id>/download` route; nothing new is generated here, only the export's own state moves on.
 */
export async function markCreativeExportDownloaded(deps: StudioDeps, who: Who, exportId: string): Promise<CreativeExportView> {
  const job = await findOwnExport(deps.db, who.storeId, exportId);
  if (job.status !== 'APPROVED') throw new StudioError('WRONG_STATE', 'only an export ready to go out can be downloaded', ['status']);
  const row = await deps.db.creativeExport.update({ where: { id: job.id }, data: { status: 'PUBLISHED' } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.export.download', entityType: 'CreativeExport', entityId: job.id, before: { status: job.status }, after: { status: row.status } }, who.ctx);
  const productIds = await productIdsFor(deps.db, who.storeId, row.selection as CreativeExportSelection).catch(() => []);
  return view(row, { productCount: productIds.length, assetCount: row.outputAssetIds.length });
}
