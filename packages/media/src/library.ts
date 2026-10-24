// PR 22, 25, 37 — the media library on the storage adapter (PR 18): upload with standardisation, search, reuse, the
// product gallery, and the orphan clean-up. Every function checks the permission itself (B6.5: on the server, not on
// the page) and writes the audit log in the same transaction as the change.
//
// Nothing is deleted (CLAUDE.md rules 3 and 6). "Archive" is a soft delete: the row keeps every field, the file stays
// in storage, and "restore" brings it back. The orphan clean-up only archives, only files used nowhere, only after
// the grace period, only on an explicit admin request that names the files, and each one is logged with its reason.
// Removing a file from storage for good is not built: it needs the owner's written OK (BLOCKED.md).
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { deliveryConfig, uploadRules } from './config';
import { nowOf, type MediaDeps } from './deps';
import { MediaError } from './errors';
import { dispatch } from './jobs';
import { extensionOf, originalKey, sha256, slugify, stripExtension } from './naming';
import { photoSetStatus, type PhotoSetStatus } from './photos';
import { inspectImage } from './process';
import { findUses, type Use } from './references';

type Tx = Prisma.TransactionClient;
type AssetRow = Prisma.MediaAssetGetPayload<object>;

const DAY_MS = 24 * 3600 * 1000;
const TEXT_MAX = 300;
const TAGS_MAX = 30;

export interface MediaSummary {
  id: string;
  storeId: number;
  kind: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  dominantColor: string | null;
  originalFileName: string | null;
  altEn: string | null;
  altBn: string | null;
  folder: string | null;
  tags: string[];
  /** IMAGE: `ready` when every size × format of the current settings exists, else `processing`. */
  status: 'ready' | 'processing' | 'stored';
  renditions: number;
  /** Active product galleries using it. */
  productUses: number;
  archivedAt: Date | null;
  createdAt: Date;
}

function summary(a: AssetRow & { _count?: { renditions?: number; productMedia?: number } }, expected: number): MediaSummary {
  const renditions = a._count?.renditions ?? 0;
  return {
    id: a.id,
    storeId: a.storeId,
    kind: a.kind,
    mimeType: a.mimeType,
    bytes: Number(a.bytes),
    width: a.width,
    height: a.height,
    dominantColor: a.dominantColor,
    originalFileName: a.originalFileName,
    altEn: a.altEn,
    altBn: a.altBn,
    folder: a.folder,
    tags: a.tags,
    status: a.kind !== 'IMAGE' ? 'stored' : renditions >= expected ? 'ready' : 'processing',
    renditions,
    productUses: a._count?.productMedia ?? 0,
    archivedAt: a.archivedAt,
    createdAt: a.createdAt,
  };
}

const COUNTS = { _count: { select: { renditions: true, productMedia: { where: { archivedAt: null } } } } } as const;

async function expectedRenditions(deps: MediaDeps, storeId: number): Promise<number> {
  const d = await deliveryConfig(deps.settings, storeId);
  return d.presets.length * d.formats.length;
}

const cleanText = (v: unknown, field: string): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string' || v.length > TEXT_MAX) throw new MediaError('INVALID_INPUT', `${field} must be a short text`, [field]);
  const t = v.trim();
  return t || null;
};

const cleanTags = (v: unknown): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > TAGS_MAX || !v.every((t) => typeof t === 'string' && t.trim().length > 0 && t.length <= 60)) {
    throw new MediaError('INVALID_INPUT', 'tags must be a short list of words', ['tags']);
  }
  return [...new Set(v.map((t: string) => t.trim().toLowerCase()))];
};

async function loadAsset(db: PrismaClient | Tx, storeId: number, id: string): Promise<AssetRow> {
  const a = await db.mediaAsset.findFirst({ where: { id, storeId } });
  if (!a) throw new MediaError('NOT_FOUND', 'no such file in this store');
  return a;
}

// ---------------------------------------------------------------------------------------------------------- upload

export interface UploadInput {
  storeId: number;
  body: Uint8Array;
  /** The name the file had on the uploader's device (kept for search, never trusted for the type). */
  fileName?: string | null;
  /** A descriptive name for the file name, e.g. "pique polo navy front" (P06 §3); else the device file name. */
  name?: string | null;
  altEn?: string | null;
  altBn?: string | null;
  folder?: string | null;
  tags?: string[];
}

export interface UploadResult {
  asset: MediaSummary;
  /** The same photo (same bytes) was already in the library: it is reused, not stored twice. */
  reused: boolean;
  /** What happened to the rendition job. */
  processing: 'queued' | 'deferred' | 'done' | 'not-needed';
}

/** PR 22 — upload one photo: checked, the original archived as it came, the sizes made in the background. */
export async function uploadImage(deps: MediaDeps, actor: Actor, input: UploadInput, ctx: RequestContext = {}): Promise<UploadResult> {
  await requirePermission(deps.db, actor, 'media.upload', { storeId: input.storeId });
  const rules = await uploadRules(deps.settings, input.storeId);
  const body = input.body;
  if (body.byteLength === 0) throw new MediaError('INVALID_INPUT', 'the file is empty', ['file']);
  if (body.byteLength > rules.maxBytes) throw new MediaError('TOO_LARGE', 'the file is larger than the upload limit', [`max:${rules.maxBytes}`]);
  const info = await inspectImage(body);
  if (!info) throw new MediaError('NOT_AN_IMAGE', 'the file is not a picture');
  if (!rules.acceptedTypes.includes(info.mime)) throw new MediaError('TYPE_NOT_ALLOWED', 'this kind of picture is not accepted', [info.mime]);
  if (info.width < rules.minWidth) throw new MediaError('TOO_SMALL', 'the photo is narrower than the smallest allowed width', [`width:${info.width}`, `min:${rules.minWidth}`]);
  const altEn = cleanText(input.altEn, 'altEn');
  const altBn = cleanText(input.altBn, 'altBn');
  const folder = cleanText(input.folder, 'folder');
  const tags = cleanTags(input.tags) ?? [];
  const fileName = cleanText(input.fileName, 'fileName');

  const checksum = sha256(body);
  const expected = await expectedRenditions(deps, input.storeId);

  // Reuse: the same bytes in the same store are one file. An archived copy comes back instead of a second copy.
  const same = await deps.db.mediaAsset.findFirst({ where: { storeId: input.storeId, checksumSha256: checksum, kind: 'IMAGE', isOriginal: true }, orderBy: { createdAt: 'asc' } });
  if (same) {
    if (same.archivedAt) {
      await deps.db.$transaction(async (tx) => {
        await tx.mediaAsset.update({ where: { id: same.id }, data: { archivedAt: null } });
        await audit(tx, actor, { storeId: input.storeId, action: 'media.restore', entityType: 'MediaAsset', entityId: same.id, before: { archivedAt: same.archivedAt }, after: { archivedAt: null, reason: 'uploaded-again' } }, ctx);
      });
    }
    const processing = await dispatch(deps, { name: 'media.render', assetId: same.id }, rules.processing);
    const fresh = await deps.db.mediaAsset.findUniqueOrThrow({ where: { id: same.id }, include: COUNTS });
    return { asset: summary(fresh, expected), reused: true, processing };
  }

  const ext = extensionOf(info.format === 'heif' ? (info.mime === 'image/avif' ? 'avif' : 'heif') : (info.format as 'jpeg'));
  const slug = slugify(input.name ?? (fileName ? stripExtension(fileName) : null));
  const key = originalKey({ storeId: input.storeId, checksum, slug, ext, at: nowOf(deps) });
  const storage = await deps.storage(input.storeId);
  await storage.put(key, body, info.mime);

  const asset = await deps.db.$transaction(async (tx) => {
    const a = await tx.mediaAsset.create({
      data: {
        storeId: input.storeId,
        kind: 'IMAGE',
        storage: storage.provider,
        storageKey: key,
        originalFileName: fileName ?? null,
        mimeType: info.mime,
        bytes: BigInt(body.byteLength),
        width: info.width,
        height: info.height,
        checksumSha256: checksum,
        isOriginal: true,
        altEn: altEn ?? null,
        altBn: altBn ?? null,
        folder: folder ?? null,
        tags,
        uploadedById: actor.staffUserId,
        createdAt: nowOf(deps),
      },
      include: COUNTS,
    });
    await audit(tx, actor, {
      storeId: input.storeId,
      action: 'media.upload',
      entityType: 'MediaAsset',
      entityId: a.id,
      after: { storageKey: key, storage: storage.provider, mimeType: info.mime, bytes: body.byteLength, width: info.width, height: info.height },
    }, ctx);
    return a;
  });
  const processing = await dispatch(deps, { name: 'media.render', assetId: asset.id }, rules.processing);
  const fresh = processing === 'done' ? await deps.db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id }, include: COUNTS }) : asset;
  return { asset: summary(fresh, expected), reused: false, processing };
}

export interface CustomerUploadInput {
  storeId: number;
  body: Uint8Array;
  /** The name the file had on his phone (kept for search, never trusted for the type). */
  fileName?: string | null;
  /** The largest file this page takes, in bytes — the page's own setting (e.g. `reviews.submit.photos.maxMb`). */
  maxBytes: number;
  /** Where it is filed in the library, so staff can tell these apart from the shop's own photos. */
  folder: string;
  /** What it is, for the file name ("review photo"). */
  name: string;
}

/**
 * S02 · PR 65 — a photo a **customer** sends with his review. Nobody signs in as staff here, so there is no staff
 * permission to check: the caller has already checked that this is the signed-in customer's own order, and the page's
 * own setting says how large a file it takes. Everything else is the staff upload's path — the same type and size
 * checks, the same "same bytes, one file" reuse, the same renditions job (PR 22) — because the photo ends up on the
 * product page beside the shop's own pictures. The library row carries no uploader: a customer is not staff.
 */
export async function uploadCustomerImage(deps: MediaDeps, input: CustomerUploadInput): Promise<UploadResult> {
  const rules = await uploadRules(deps.settings, input.storeId);
  const body = input.body;
  const maxBytes = Math.min(input.maxBytes, rules.maxBytes);
  if (body.byteLength === 0) throw new MediaError('INVALID_INPUT', 'the file is empty', ['file']);
  if (body.byteLength > maxBytes) throw new MediaError('TOO_LARGE', 'the file is larger than this page allows', [`max:${maxBytes}`]);
  const info = await inspectImage(body);
  if (!info) throw new MediaError('NOT_AN_IMAGE', 'the file is not a picture');
  if (!rules.acceptedTypes.includes(info.mime)) throw new MediaError('TYPE_NOT_ALLOWED', 'this kind of picture is not accepted', [info.mime]);
  const fileName = cleanText(input.fileName, 'fileName') ?? null;
  const folder = cleanText(input.folder, 'folder') ?? null;
  const checksum = sha256(body);
  const expected = await expectedRenditions(deps, input.storeId);

  const same = await deps.db.mediaAsset.findFirst({ where: { storeId: input.storeId, checksumSha256: checksum, kind: 'IMAGE', isOriginal: true }, orderBy: { createdAt: 'asc' } });
  if (same) {
    const processing = await dispatch(deps, { name: 'media.render', assetId: same.id }, rules.processing);
    const fresh = await deps.db.mediaAsset.findUniqueOrThrow({ where: { id: same.id }, include: COUNTS });
    return { asset: summary(fresh, expected), reused: true, processing };
  }

  const ext = extensionOf(info.format === 'heif' ? (info.mime === 'image/avif' ? 'avif' : 'heif') : (info.format as 'jpeg'));
  const key = originalKey({ storeId: input.storeId, checksum, slug: slugify(input.name), ext, at: nowOf(deps) });
  const storage = await deps.storage(input.storeId);
  await storage.put(key, body, info.mime);
  const asset = await deps.db.$transaction(async (tx) => {
    const a = await tx.mediaAsset.create({
      data: {
        storeId: input.storeId,
        kind: 'IMAGE',
        storage: storage.provider,
        storageKey: key,
        originalFileName: fileName,
        mimeType: info.mime,
        bytes: BigInt(body.byteLength),
        width: info.width,
        height: info.height,
        checksumSha256: checksum,
        isOriginal: true,
        folder,
        tags: [],
        createdAt: nowOf(deps),
      },
      include: COUNTS,
    });
    await audit(
      tx,
      { staffUserId: null },
      { storeId: input.storeId, action: 'media.customerUpload', entityType: 'MediaAsset', entityId: a.id, after: { storageKey: key, mimeType: info.mime, bytes: body.byteLength, folder } },
      { source: 'shop-account' },
    );
    return a;
  });
  const processing = await dispatch(deps, { name: 'media.render', assetId: asset.id }, rules.processing);
  const fresh = processing === 'done' ? await deps.db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id }, include: COUNTS }) : asset;
  return { asset: summary(fresh, expected), reused: false, processing };
}

export interface StoredFileInput {
  storeId: number;
  kind: 'PDF' | 'IMAGE' | 'DOCUMENT' | 'VIDEO' | 'AUDIO' | 'OTHER';
  body: Uint8Array;
  contentType: string;
  /** Descriptive name for the file name. */
  name: string;
  extension: string;
  folder?: string | null;
}

/**
 * A file the shop makes itself (a generated invoice PDF, a WhatsApp invoice JPG, a report): stored as it is through
 * the storage adapter and recorded in the library, without renditions. Called by the system (no staff permission).
 */
export async function storeGeneratedFile(deps: MediaDeps, input: StoredFileInput): Promise<MediaSummary> {
  if (!/^[a-z0-9]{1,8}$/.test(input.extension)) throw new MediaError('INVALID_INPUT', 'extension must be short and lower-case', ['extension']);
  const checksum = sha256(input.body);
  const key = originalKey({ storeId: input.storeId, checksum, slug: slugify(input.name), ext: input.extension, at: nowOf(deps) });
  const storage = await deps.storage(input.storeId);
  await storage.put(key, input.body, input.contentType);
  const a = await deps.db.$transaction(async (tx) => {
    const row = await tx.mediaAsset.create({
      data: {
        storeId: input.storeId,
        kind: input.kind,
        storage: storage.provider,
        storageKey: key,
        mimeType: input.contentType,
        bytes: BigInt(input.body.byteLength),
        checksumSha256: checksum,
        isOriginal: true,
        folder: cleanText(input.folder, 'folder') ?? null,
        tags: [],
        createdAt: nowOf(deps),
      },
      include: COUNTS,
    });
    await audit(tx, { staffUserId: null }, { storeId: input.storeId, action: 'media.store', entityType: 'MediaAsset', entityId: row.id, after: { storageKey: key, kind: input.kind } }, { source: 'media' });
    return row;
  });
  return summary(a, 0);
}

// ---------------------------------------------------------------------------------------------------------- search

export interface SearchInput {
  storeId: number;
  q?: string | null;
  kind?: string | null;
  folder?: string | null;
  tag?: string | null;
  /** `used`: on at least one active product gallery; `unused`: on none. */
  usage?: 'any' | 'used' | 'unused';
  archived?: 'no' | 'only' | 'all';
  cursor?: string | null;
  take?: number;
}

const KINDS = ['IMAGE', 'VIDEO', 'AUDIO', 'PDF', 'DOCUMENT', 'OTHER'] as const;

/** PR 37 — search the library: words in the file name, the alt texts, the folder or a tag; newest first. */
export async function searchMedia(deps: MediaDeps, actor: Actor, input: SearchInput): Promise<{ items: MediaSummary[]; nextCursor: string | null }> {
  await requirePermission(deps.db, actor, 'media.read', { storeId: input.storeId });
  const pageSize = await deps.settings.value('media.library.pageSize', { storeId: input.storeId });
  const take = Math.min(Math.max(1, input.take ?? pageSize), pageSize);
  const q = cleanText(input.q, 'q');
  if (input.kind && !(KINDS as readonly string[]).includes(input.kind)) throw new MediaError('INVALID_INPUT', 'unknown kind', ['kind']);
  const and: Prisma.MediaAssetWhereInput[] = [{ storeId: input.storeId }];
  const archived = input.archived ?? 'no';
  if (archived === 'no') and.push({ archivedAt: null });
  if (archived === 'only') and.push({ archivedAt: { not: null } });
  if (input.kind) and.push({ kind: input.kind as (typeof KINDS)[number] });
  if (input.folder) and.push({ folder: input.folder });
  if (input.tag) and.push({ tags: { has: input.tag.trim().toLowerCase() } });
  if (input.usage === 'used') and.push({ productMedia: { some: { archivedAt: null } } });
  if (input.usage === 'unused') and.push({ productMedia: { none: { archivedAt: null } } });
  if (q) {
    const words = q.split(/\s+/).filter(Boolean).slice(0, 8);
    for (const w of words) {
      and.push({
        OR: [
          { originalFileName: { contains: w, mode: 'insensitive' } },
          { altEn: { contains: w, mode: 'insensitive' } },
          { altBn: { contains: w, mode: 'insensitive' } },
          { folder: { contains: w, mode: 'insensitive' } },
          { storageKey: { contains: w.toLowerCase() } },
          { tags: { has: w.toLowerCase() } },
        ],
      });
    }
  }
  const rows = await deps.db.mediaAsset.findMany({
    where: { AND: and },
    include: COUNTS,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const expected = await expectedRenditions(deps, input.storeId);
  const page = rows.slice(0, take);
  return { items: page.map((r) => summary(r, expected)), nextCursor: rows.length > take ? page[page.length - 1]!.id : null };
}

export interface MediaDetail extends MediaSummary {
  renditionList: { preset: string; format: string; width: number; height: number; bytes: number; storageKey: string }[];
  uses: Use[];
}

export async function getMedia(deps: MediaDeps, actor: Actor, where: { storeId: number; id: string }): Promise<MediaDetail> {
  await requirePermission(deps.db, actor, 'media.read', { storeId: where.storeId });
  const a = await deps.db.mediaAsset.findFirst({ where: { id: where.id, storeId: where.storeId }, include: { ...COUNTS, renditions: { orderBy: [{ width: 'asc' }, { format: 'asc' }] } } });
  if (!a) throw new MediaError('NOT_FOUND', 'no such file in this store');
  const uses = (await findUses(deps.db, [a.id])).get(a.id) ?? [];
  return {
    ...summary(a, await expectedRenditions(deps, where.storeId)),
    renditionList: a.renditions.map((r) => ({ preset: r.preset, format: r.format, width: r.width, height: r.height, bytes: r.bytes, storageKey: r.storageKey })),
    uses,
  };
}

export interface MediaPatch {
  altEn?: string | null;
  altBn?: string | null;
  folder?: string | null;
  tags?: string[];
}

/** Alt texts, folder and tags (the file itself never changes: a new photo is a new upload). */
export async function updateMedia(deps: MediaDeps, actor: Actor, where: { storeId: number; id: string }, patch: MediaPatch, ctx: RequestContext = {}): Promise<MediaSummary> {
  await requirePermission(deps.db, actor, 'media.upload', { storeId: where.storeId });
  const data: Prisma.MediaAssetUpdateInput = {};
  const altEn = cleanText(patch.altEn, 'altEn');
  const altBn = cleanText(patch.altBn, 'altBn');
  const folder = cleanText(patch.folder, 'folder');
  const tags = cleanTags(patch.tags);
  if (altEn !== undefined) data.altEn = altEn;
  if (altBn !== undefined) data.altBn = altBn;
  if (folder !== undefined) data.folder = folder;
  if (tags !== undefined) data.tags = tags;
  if (!Object.keys(data).length) throw new MediaError('INVALID_INPUT', 'nothing to change', ['(empty change)']);
  const expected = await expectedRenditions(deps, where.storeId);
  return deps.db.$transaction(async (tx) => {
    const before = await loadAsset(tx, where.storeId, where.id);
    const a = await tx.mediaAsset.update({ where: { id: before.id }, data, include: COUNTS });
    const pick = (x: AssetRow) => Object.fromEntries(Object.keys(data).map((k) => [k, x[k as keyof AssetRow]]));
    await audit(tx, actor, { storeId: where.storeId, action: 'media.update', entityType: 'MediaAsset', entityId: a.id, before: pick(before), after: pick(a) }, ctx);
    return summary(a, expected);
  });
}

// ------------------------------------------------------------------------------------------------ archive / restore

/** Soft delete. Refused while the file is used anywhere (the answer names where). */
export async function archiveMedia(deps: MediaDeps, actor: Actor, where: { storeId: number; id: string }, reason: string, ctx: RequestContext = {}): Promise<MediaSummary> {
  await requirePermission(deps.db, actor, 'media.manage', { storeId: where.storeId });
  const why = cleanText(reason, 'reason');
  if (!why) throw new MediaError('INVALID_INPUT', 'say why the file is archived', ['reason']);
  const a = await loadAsset(deps.db, where.storeId, where.id);
  if (a.archivedAt) throw new MediaError('ARCHIVED', 'the file is already archived');
  const uses = (await findUses(deps.db, [a.id])).get(a.id) ?? [];
  if (uses.length) throw new MediaError('STILL_IN_USE', 'the file is still used', uses.map((u) => u.where));
  const expected = await expectedRenditions(deps, where.storeId);
  return deps.db.$transaction(async (tx) => {
    const row = await tx.mediaAsset.update({ where: { id: a.id }, data: { archivedAt: nowOf(deps) }, include: COUNTS });
    await audit(tx, actor, { storeId: where.storeId, action: 'media.archive', entityType: 'MediaAsset', entityId: a.id, before: { archivedAt: null }, after: { archivedAt: row.archivedAt, reason: why } }, ctx);
    return summary(row, expected);
  });
}

export async function restoreMedia(deps: MediaDeps, actor: Actor, where: { storeId: number; id: string }, ctx: RequestContext = {}): Promise<MediaSummary> {
  await requirePermission(deps.db, actor, 'media.manage', { storeId: where.storeId });
  const a = await loadAsset(deps.db, where.storeId, where.id);
  if (!a.archivedAt) throw new MediaError('INVALID_INPUT', 'the file is not archived', ['archived']);
  await deps.db.$transaction(async (tx) => {
    await tx.mediaAsset.update({ where: { id: a.id }, data: { archivedAt: null } });
    await audit(tx, actor, { storeId: where.storeId, action: 'media.restore', entityType: 'MediaAsset', entityId: a.id, before: { archivedAt: a.archivedAt }, after: { archivedAt: null } }, ctx);
  });
  // An archived photo was skipped by "remake every size": bring its sizes up to date.
  const rules = await uploadRules(deps.settings, where.storeId);
  if (a.kind === 'IMAGE') await dispatch(deps, { name: 'media.render', assetId: a.id }, rules.processing);
  const fresh = await deps.db.mediaAsset.findUniqueOrThrow({ where: { id: a.id }, include: COUNTS });
  return summary(fresh, await expectedRenditions(deps, where.storeId));
}

// -------------------------------------------------------------------------------------------------------- orphans

export interface OrphanList {
  graceDays: number;
  items: MediaSummary[];
  /** Pass back as `cursor` to look further; null when every file has been looked at. */
  nextCursor: string | null;
}

/**
 * PR 37 — files used nowhere (no product, category, combo, review, chat, document, setting … row points at them),
 * older than `media.orphans.graceDays`. A list only: nothing changes.
 */
export async function findOrphans(deps: MediaDeps, actor: Actor, input: { storeId: number; cursor?: string | null }): Promise<OrphanList> {
  await requirePermission(deps.db, actor, 'media.read', { storeId: input.storeId });
  const [graceDays, take] = await Promise.all([
    deps.settings.value('media.orphans.graceDays', { storeId: input.storeId }),
    deps.settings.value('media.library.pageSize', { storeId: input.storeId }),
  ]);
  const before = new Date(nowOf(deps).getTime() - graceDays * DAY_MS);
  const rows = await deps.db.mediaAsset.findMany({
    where: { storeId: input.storeId, archivedAt: null, createdAt: { lt: before } },
    include: COUNTS,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const uses = await findUses(deps.db, rows.map((r) => r.id));
  const expected = await expectedRenditions(deps, input.storeId);
  return {
    graceDays,
    items: rows.filter((r) => !uses.has(r.id)).map((r) => summary(r, expected)),
    nextCursor: rows.length === take ? rows[rows.length - 1]!.id : null,
  };
}

export interface CleanupResult {
  archived: string[];
  skipped: { id: string; why: 'NOT_FOUND' | 'ALREADY_ARCHIVED' | 'TOO_NEW' | 'IN_USE' }[];
}

/**
 * The clean-up button: archives the named files, each re-checked first (still used nowhere, still past the grace
 * period). Every archived file gets its own audit entry with the reason. Files stay in storage; restore undoes it.
 */
export async function archiveOrphans(deps: MediaDeps, actor: Actor, input: { storeId: number; assetIds: string[]; reason: string }, ctx: RequestContext = {}): Promise<CleanupResult> {
  await requirePermission(deps.db, actor, 'media.manage', { storeId: input.storeId });
  const why = cleanText(input.reason, 'reason');
  if (!why) throw new MediaError('INVALID_INPUT', 'say why the files are cleaned up', ['reason']);
  const pageSize = await deps.settings.value('media.library.pageSize', { storeId: input.storeId });
  const ids = [...new Set(input.assetIds)];
  if (!ids.length || ids.length > pageSize) throw new MediaError('INVALID_INPUT', 'name between one file and one page of files', ['assetIds']);
  const graceDays = await deps.settings.value('media.orphans.graceDays', { storeId: input.storeId });
  const before = new Date(nowOf(deps).getTime() - graceDays * DAY_MS);
  const rows = await deps.db.mediaAsset.findMany({ where: { storeId: input.storeId, id: { in: ids } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const uses = await findUses(deps.db, ids);
  const out: CleanupResult = { archived: [], skipped: [] };
  const now = nowOf(deps);
  await deps.db.$transaction(async (tx) => {
    for (const id of ids) {
      const a = byId.get(id);
      if (!a) out.skipped.push({ id, why: 'NOT_FOUND' });
      else if (a.archivedAt) out.skipped.push({ id, why: 'ALREADY_ARCHIVED' });
      else if (a.createdAt >= before) out.skipped.push({ id, why: 'TOO_NEW' });
      else if (uses.has(id)) out.skipped.push({ id, why: 'IN_USE' });
      else {
        // Archive only if nothing changed since the check (no concurrent archive, still not archived).
        const n = await tx.mediaAsset.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: now } });
        if (n.count === 1) {
          await audit(tx, actor, { storeId: input.storeId, action: 'media.orphan.archive', entityType: 'MediaAsset', entityId: id, before: { archivedAt: null }, after: { archivedAt: now, reason: why, graceDays } }, ctx);
          out.archived.push(id);
        } else out.skipped.push({ id, why: 'ALREADY_ARCHIVED' });
      }
    }
  });
  return out;
}

// --------------------------------------------------------------------------------------------- product galleries

export interface AttachInput {
  storeId: number;
  productId: string;
  assetId: string;
  role: 'FRONT' | 'BACK' | 'DETAIL' | 'ON_MODEL' | 'FLAT_LAY' | 'FABRIC' | 'TRUE_COLOUR' | 'SET' | 'VIDEO' | 'OTHER';
  colourId?: string | null;
  sortOrder?: number;
  isPrimary?: boolean;
}

const ROLES = ['FRONT', 'BACK', 'DETAIL', 'ON_MODEL', 'FLAT_LAY', 'FABRIC', 'TRUE_COLOUR', 'SET', 'VIDEO', 'OTHER'] as const;

export interface ProductPhoto {
  id: string;
  assetId: string;
  role: string;
  colourId: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface GalleryResult {
  photos: ProductPhoto[];
  status: PhotoSetStatus;
}

const photoOf = (l: { id: string; assetId: string; role: string; colourId: string | null; sortOrder: number; isPrimary: boolean }): ProductPhoto => ({
  id: l.id,
  assetId: l.assetId,
  role: l.role,
  colourId: l.colourId,
  sortOrder: l.sortOrder,
  isPrimary: l.isPrimary,
});

export async function productGallery(deps: MediaDeps, actor: Actor, where: { storeId: number; productId: string }): Promise<GalleryResult> {
  await requirePermission(deps.db, actor, 'media.read', { storeId: where.storeId });
  await requireProduct(deps.db, where.storeId, where.productId);
  return gallery(deps, where);
}

async function gallery(deps: MediaDeps, where: { storeId: number; productId: string }): Promise<GalleryResult> {
  const links = await deps.db.productMedia.findMany({
    where: { storeId: where.storeId, productId: where.productId, archivedAt: null },
    orderBy: [{ colourId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return { photos: links.map(photoOf), status: await photoSetStatus(deps, where) };
}

async function requireProduct(db: PrismaClient | Tx, storeId: number, productId: string) {
  const p = await db.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
  if (!p) throw new MediaError('NOT_FOUND', 'no such product in this store', ['productId']);
}

/** Places a library photo on a product (reuse: one file can be on many products). Idempotent for the same place. */
export async function attachToProduct(deps: MediaDeps, actor: Actor, input: AttachInput, ctx: RequestContext = {}): Promise<GalleryResult> {
  await requirePermission(deps.db, actor, 'media.upload', { storeId: input.storeId });
  if (!(ROLES as readonly string[]).includes(input.role)) throw new MediaError('INVALID_INPUT', 'unknown photo kind', ['role']);
  if (input.sortOrder !== undefined && (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)) throw new MediaError('INVALID_INPUT', 'sortOrder must be a whole number', ['sortOrder']);
  await requireProduct(deps.db, input.storeId, input.productId);
  const asset = await loadAsset(deps.db, input.storeId, input.assetId);
  if (asset.archivedAt) throw new MediaError('ARCHIVED', 'restore the file before using it');
  const wantKind = input.role === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  if (asset.kind !== wantKind) throw new MediaError('INVALID_INPUT', 'this file cannot be used for that kind of photo', ['role']);
  const colourId = input.colourId ?? null;
  if (colourId) {
    const c = await deps.db.colour.findFirst({ where: { id: colourId, storeId: input.storeId }, select: { id: true } });
    if (!c) throw new MediaError('NOT_FOUND', 'no such colour in this store', ['colourId']);
  }
  await deps.db.$transaction(async (tx) => {
    const same = await tx.productMedia.findFirst({ where: { storeId: input.storeId, productId: input.productId, assetId: input.assetId, role: input.role, colourId, archivedAt: null } });
    if (same) return;
    const last = await tx.productMedia.aggregate({ where: { productId: input.productId, colourId, archivedAt: null }, _max: { sortOrder: true } });
    if (input.isPrimary) {
      await tx.productMedia.updateMany({ where: { productId: input.productId, colourId, archivedAt: null, isPrimary: true }, data: { isPrimary: false } });
    }
    const link = await tx.productMedia.create({
      data: {
        storeId: input.storeId,
        productId: input.productId,
        assetId: input.assetId,
        role: input.role,
        colourId,
        sortOrder: input.sortOrder ?? (last._max.sortOrder ?? -1) + 1,
        isPrimary: input.isPrimary ?? false,
      },
    });
    await audit(tx, actor, { storeId: input.storeId, action: 'media.attach', entityType: 'ProductMedia', entityId: link.id, after: photoOf(link) }, ctx);
  });
  return gallery(deps, input);
}

/** Takes a photo off a product (the link is archived; the file stays in the library). */
export async function detachFromProduct(deps: MediaDeps, actor: Actor, input: { storeId: number; productId: string; productMediaId: string }, ctx: RequestContext = {}): Promise<GalleryResult> {
  await requirePermission(deps.db, actor, 'media.upload', { storeId: input.storeId });
  await deps.db.$transaction(async (tx) => {
    const link = await tx.productMedia.findFirst({ where: { id: input.productMediaId, storeId: input.storeId, productId: input.productId } });
    if (!link) throw new MediaError('NOT_FOUND', 'no such photo on this product');
    if (link.archivedAt) return;
    const now = nowOf(deps);
    await tx.productMedia.update({ where: { id: link.id }, data: { archivedAt: now, isPrimary: false } });
    await audit(tx, actor, { storeId: input.storeId, action: 'media.detach', entityType: 'ProductMedia', entityId: link.id, before: photoOf(link), after: { archivedAt: now } }, ctx);
  });
  return gallery(deps, input);
}

/** PR 37 — remake every size of every photo of a store (after a size, ratio, format or quality change). */
export async function regenerateAll(deps: MediaDeps, actor: Actor, input: { storeId: number }, ctx: RequestContext = {}): Promise<'queued' | 'deferred' | 'done'> {
  await requirePermission(deps.db, actor, 'media.manage', { storeId: input.storeId });
  await audit(deps.db, actor, { storeId: input.storeId, action: 'media.regenerate', entityType: 'Store', entityId: String(input.storeId) }, ctx);
  const rules = await uploadRules(deps.settings, input.storeId);
  return dispatch(deps, { name: 'media.regenerate', storeId: input.storeId }, rules.processing);
}

