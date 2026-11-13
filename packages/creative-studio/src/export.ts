// S25 · PR 487 (Blueprint C8.1, C8.5, C8.6 item 7) — campaign creative export, part 1: from a campaign the owner
// picks a product, a SKU, or a whole category/sub-category — exactly one, never a mix (Blueprint C8.5: "a product, a
// SKU, or a whole category"). `requestCreativeExport` only gathers and validates the inputs and leaves the row
// `DRAFT`: it checks the chosen selection is a real, non-archived record of this store, that it already has at least
// one real approved image or video to export from (`SOURCE_INVALID` otherwise — nothing to export from an empty
// product), and that an optional campaign or creative brief, when named, is a real record of this store too
// (`NOT_FOUND`). `SELECTION_EMPTY` refuses a request that names no product, SKU or category at all.
//
// S25 · PR 488 (Blueprint C8.5, C8.6 item 8) — campaign creative export, part 2, the actual producer. No real
// crop/safe-zone engine or ad-account sender is in the stack today (the same honest gap PR 439/482/485/486 already
// note), so `produceCreativeExport` does not actually crop, bake in the overlay or send anything anywhere: it fills
// `outputAssetIds`, one per chosen platform size, with the **selection's own first real, already-approved media
// asset** (re-read at production time, never assumed still good from the request), reused for every size — a real,
// already-existing file, never a fabricated per-size crop. The row moves `DRAFT`/`FAILED` → `READY` (or stays
// `FAILED`, never thrown past, when the selection no longer has anything approved to export from). Sending a `READY`
// export to a connected ad account is a later refinement that touches only this file, never `requestCreativeExport`.
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { audit } from '@extas/auth';
import { StudioError } from './errors';
import type { StudioDeps, Who } from './context';

/** The platform sizes Blueprint C8.5 names ("every platform size — Meta 1:1, 4:5 and 9:16; Google 1.91:1; TikTok
 * 9:16"). A technical list of what the export pipeline can cut for, not a CN-018 business number. Meta's and
 * TikTok's own 9:16 are kept as separate keys — same ratio, but each platform gets its own safe-zone crop once a
 * real crop engine exists (PR 488), so they are never silently merged into one output. */
export const CREATIVE_EXPORT_SIZES = ['meta-1x1', 'meta-4x5', 'meta-9x16', 'google-1.91x1', 'tiktok-9x16'] as const; // hardcode-ok: a technical format list, not a price or policy number
export type CreativeExportSize = (typeof CREATIVE_EXPORT_SIZES)[number];

export const CREATIVE_EXPORT_LANDING_URL_MAX = 2048;

/** Exactly one of a product, a SKU (variant) or a category — Blueprint C8.5's own three choices. Zod's `.refine`
 * below only catches *more than one* chosen (a shape mistake, `INVALID_INPUT`); *none* chosen passes the schema and
 * is refused by `requestCreativeExport` itself with the more specific `SELECTION_EMPTY`. */
export const creativeExportSelection = z
  .object({
    // `.default(null)` (not just `.nullish()`) so a selection always round-trips through storage with all three
    // keys present and the two unused ones explicitly `null`, never silently absent from the stored JSON.
    productId: z.string().uuid().nullable().default(null),
    variantId: z.string().uuid().nullable().default(null),
    categoryId: z.string().uuid().nullable().default(null),
  })
  .strict()
  .refine((d) => [d.productId, d.variantId, d.categoryId].filter((v) => v != null).length <= 1, {
    message: 'pick only one of a product, a SKU or a category',
    path: ['productId'],
  });
export type CreativeExportSelection = z.infer<typeof creativeExportSelection>;

export const requestCreativeExportInput = z
  .object({
    selection: creativeExportSelection,
    /** Every platform size this export should be cut for, once PR 488 can actually cut them. */
    sizes: z.array(z.enum(CREATIVE_EXPORT_SIZES)).min(1).max(CREATIVE_EXPORT_SIZES.length),
    /** Blueprint C8.5: "optional price or offer overlay pulled from the campaign itself". */
    withOverlay: z.boolean().optional().default(false),
    /** Blueprint C8.5: "the tracked landing URL". */
    landingUrl: z.string().trim().url().max(CREATIVE_EXPORT_LANDING_URL_MAX).nullish(),
    campaignId: z.string().uuid().nullish(),
    briefId: z.string().uuid().nullish(),
  })
  .strict()
  .refine((d) => new Set(d.sizes).size === d.sizes.length, { message: 'the same size cannot be chosen twice', path: ['sizes'] });
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
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  campaignId: string | null;
  briefId: string | null;
  selection: Prisma.JsonValue;
  sizes: string[];
  withOverlay: boolean;
  landingUrl: string | null;
  outputAssetIds: string[];
  sentToAdAccountId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function view(r: Row): CreativeExportView {
  return {
    id: r.id,
    campaignId: r.campaignId,
    briefId: r.briefId,
    selection: r.selection as unknown as CreativeExportSelection,
    sizes: r.sizes as CreativeExportSize[],
    withOverlay: r.withOverlay,
    landingUrl: r.landingUrl,
    outputAssetIds: r.outputAssetIds,
    sentToAdAccountId: r.sentToAdAccountId,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Every campaign export of the store, newest first (`marketing.studio.read`, checked by the caller). Nothing is
 * ever hard-deleted — a `CreativeExport` has no archive flag of its own (like `VideoJob`, it moves through its own
 * `status` instead: `DRAFT` → `READY`/`FAILED`/`CANCELLED`), so every row this store ever asked for stays listed. */
export async function listCreativeExports(deps: StudioDeps, storeId: number): Promise<CreativeExportView[]> {
  const rows = await deps.db.creativeExport.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(view);
}

/** The selection's own first real, non-archived product image or video to export from (Blueprint C8.5: "the system
 * gathers the approved images and videos for that selection"), ordered the same way the product page shows them
 * (`sortOrder`) — or `null` when there is nothing approved yet. `ProductMedia` already live on a product counts as
 * approved — it is already published; Studio-produced reels (PR 485/486) joining the pool is a later increase in
 * scope, not this PR's or PR 488's. A SKU's own colour-specific photos count, and so do the product's shared ones
 * (`colourId` left out on a `ProductMedia` row). A category counts any of its own products' media — sub-categories
 * are their own, separately chosen, selection, never gathered recursively here. */
async function firstExportableAssetId(db: PrismaClient, storeId: number, selection: CreativeExportSelection): Promise<string | null> {
  let row: { assetId: string } | null = null;
  if (selection.productId) {
    row = await db.productMedia.findFirst({ where: { storeId, productId: selection.productId, archivedAt: null }, orderBy: { sortOrder: 'asc' }, select: { assetId: true } });
  } else if (selection.variantId) {
    const variant = await db.productVariant.findFirst({ where: { id: selection.variantId, storeId, archivedAt: null } });
    if (variant) {
      row = await db.productMedia.findFirst({ where: { storeId, productId: variant.productId, archivedAt: null, OR: [{ colourId: variant.colourId }, { colourId: null }] }, orderBy: { sortOrder: 'asc' }, select: { assetId: true } });
    }
  } else if (selection.categoryId) {
    row = await db.productMedia.findFirst({ where: { storeId, archivedAt: null, product: { storeId, categoryId: selection.categoryId, archivedAt: null } }, orderBy: { sortOrder: 'asc' }, select: { assetId: true } });
  }
  return row?.assetId ?? null;
}

/**
 * Requests a campaign creative export (`marketing.studio.write`, checked by the caller) — part 1 of Blueprint C8.6
 * item 7/8. `SELECTION_EMPTY` when the request names no product, SKU or category; `NOT_FOUND` when the one it does
 * name is not a real, non-archived record of this store, or when a named campaign/brief is not either.
 * `SOURCE_INVALID` when the selection resolves to nothing with a real approved image or video yet — there is
 * nothing to build an export from. The row is created `DRAFT`, with empty `outputAssetIds`: producing the actual
 * sized files (PR 488) comes after.
 */
export async function requestCreativeExport(deps: StudioDeps, who: Who, input: unknown): Promise<CreativeExportView> {
  const ok = requestCreativeExportInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'a campaign export needs its selection and at least one platform size', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;

  if (!d.selection.productId && !d.selection.variantId && !d.selection.categoryId) {
    throw new StudioError('SELECTION_EMPTY', 'pick a product, a SKU or a category to export', ['selection']);
  }

  if (d.selection.productId) {
    const product = await deps.db.product.findFirst({ where: { id: d.selection.productId, storeId: who.storeId, archivedAt: null } });
    if (!product) throw new StudioError('NOT_FOUND', 'no such product', ['selection', 'productId']);
  } else if (d.selection.variantId) {
    const variant = await deps.db.productVariant.findFirst({ where: { id: d.selection.variantId, storeId: who.storeId, archivedAt: null } });
    if (!variant) throw new StudioError('NOT_FOUND', 'no such SKU', ['selection', 'variantId']);
  } else if (d.selection.categoryId) {
    const category = await deps.db.category.findFirst({ where: { id: d.selection.categoryId, storeId: who.storeId, archivedAt: null } });
    if (!category) throw new StudioError('NOT_FOUND', 'no such category', ['selection', 'categoryId']);
  }

  if (d.campaignId) {
    const campaign = await deps.db.campaign.findFirst({ where: { id: d.campaignId, storeId: who.storeId, archivedAt: null } });
    if (!campaign) throw new StudioError('NOT_FOUND', 'no such campaign', ['campaignId']);
  }
  if (d.briefId) {
    const brief = await deps.db.creativeBrief.findFirst({ where: { id: d.briefId, storeId: who.storeId } });
    if (!brief) throw new StudioError('NOT_FOUND', 'no such creative brief', ['briefId']);
  }

  const previewAssetId = await firstExportableAssetId(deps.db, who.storeId, d.selection);
  if (!previewAssetId) throw new StudioError('SOURCE_INVALID', 'nothing approved to export from this selection yet', ['selection']);

  const row = await deps.db.creativeExport.create({
    data: {
      storeId: who.storeId,
      campaignId: d.campaignId ?? null,
      briefId: d.briefId ?? null,
      selection: d.selection as unknown as Prisma.InputJsonValue,
      sizes: d.sizes,
      withOverlay: d.withOverlay,
      landingUrl: d.landingUrl ?? null,
      outputAssetIds: [],
      sentToAdAccountId: null,
      status: 'DRAFT',
    },
  });
  await audit(
    deps.db,
    who.actor,
    { storeId: who.storeId, action: 'studio.export.request', entityType: 'CreativeExport', entityId: row.id, after: { selection: d.selection, sizes: d.sizes, withOverlay: d.withOverlay, landingUrl: d.landingUrl ?? null } },
    who.ctx,
  );
  return view(row);
}

/** Cancels a still-`DRAFT` export — `WRONG_STATE` once it has started producing or finished (same shape as
 * `setReelArchived`'s "only a reel still waiting" guard), a terminal status change rather than a delete: the row
 * stays listed, just as `VideoJob.REJECTED` is never removed either. */
export async function cancelCreativeExport(deps: StudioDeps, who: Who, exportId: string): Promise<CreativeExportView> {
  const row0 = await deps.db.creativeExport.findFirst({ where: { id: exportId, storeId: who.storeId } });
  if (!row0) throw new StudioError('NOT_FOUND', 'no such export', ['exportId']);
  if (row0.status !== 'DRAFT') throw new StudioError('WRONG_STATE', 'only an export still waiting to be produced can be cancelled', ['status']);
  const row = await deps.db.creativeExport.update({ where: { id: row0.id }, data: { status: 'CANCELLED' } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.export.cancel', entityType: 'CreativeExport', entityId: row.id, before: { status: row0.status }, after: { status: row.status } }, who.ctx);
  return view(row);
}

/**
 * Produces a `DRAFT` (or previously `FAILED`) export (`marketing.studio.write`, checked by the caller) — part 2 of
 * Blueprint C8.6 item 7/8. Re-reads the selection's own first approved media asset at production time (`firstExportableAssetId`,
 * the same lookup `requestCreativeExport` uses) rather than trusting it is still what it was when requested — a
 * product's last approved photo can be archived in between. Refuses a cancelled export (`WRONG_STATE` — request a
 * new one, a `CANCELLED` row is terminal) or one already `READY` (`WRONG_STATE` — never redone silently).
 *
 * No real crop/safe-zone engine exists yet (this file's header comment): nothing is actually cropped per size, the
 * offer overlay is never actually baked in, and nothing is sent to an ad account. The honest preview is that one
 * asset's id, reused for every chosen platform size (`outputAssetIds`); `FAILED` (never throws) when the selection
 * no longer has anything approved, and a `FAILED` export may be tried again with no attempt cap — this reads data
 * only, it never calls a provider or spends money, the same reasoning `assembleReel`'s own retry uses.
 */
export async function produceCreativeExport(deps: StudioDeps, who: Who, exportId: string): Promise<CreativeExportView> {
  const row0 = await deps.db.creativeExport.findFirst({ where: { id: exportId, storeId: who.storeId } });
  if (!row0) throw new StudioError('NOT_FOUND', 'no such export', ['exportId']);
  if (row0.status !== 'DRAFT' && row0.status !== 'FAILED') throw new StudioError('WRONG_STATE', 'only an export waiting to be produced, or one that failed to, can be produced', ['status']);

  const selection = row0.selection as unknown as CreativeExportSelection;
  const previewAssetId = await firstExportableAssetId(deps.db, who.storeId, selection);

  if (!previewAssetId) {
    const row = await deps.db.creativeExport.update({ where: { id: row0.id }, data: { status: 'FAILED' } });
    await audit(
      deps.db,
      who.actor,
      { storeId: who.storeId, action: 'studio.export.produce', entityType: 'CreativeExport', entityId: row.id, before: { status: row0.status }, after: { status: row.status, reason: 'nothing approved to export from this selection any more' } },
      who.ctx,
    );
    return view(row);
  }

  const outputAssetIds = row0.sizes.map(() => previewAssetId);
  const row = await deps.db.creativeExport.update({ where: { id: row0.id }, data: { status: 'READY', outputAssetIds } });
  await audit(
    deps.db,
    who.actor,
    { storeId: who.storeId, action: 'studio.export.produce', entityType: 'CreativeExport', entityId: row.id, before: { status: row0.status }, after: { status: row.status, outputAssetIds, previewOnly: true } },
    who.ctx,
  );
  return view(row);
}
