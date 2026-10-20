// The media API (PR 22, 23, 24, 25, 37). Route files under app/api/admin/media/, app/api/media/ and app/media/ are one
// line each that hand the request and the app's dependencies to a handler here, so the handlers are tested end to end
// on a real database (media-api.db.test.ts). Admin handlers go through guardAdmin first and the @extas/media functions
// check the permission again; answers carry stable codes, never text.
import { after } from 'next/server';
import { getPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import {
  archiveMedia,
  archiveOrphans,
  attachToProduct,
  detachFromProduct,
  downloadCopy,
  findOrphans,
  getMedia,
  MediaError,
  mediaHttpStatus,
  mediaRuntime,
  productGallery,
  regenerateAll,
  renditionFile,
  restoreMedia,
  searchMedia,
  updateMedia,
  uploadImage,
  type AttachInput,
  type MediaDeps,
  type SearchInput,
} from '@extas/media';
import { createVault, type Vault } from '@extas/vault';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { settingsResolver } from './settings';

const holder = globalThis as unknown as { __mediaDeps?: MediaDeps; __mediaVault?: Pick<Vault, 'get'> | null };

/** The media dependencies, or null when the server gave the app no database (CI, `next build`). */
export function mediaDeps(): MediaDeps | null {
  const settings = settingsResolver();
  if (!settings) return null;
  if (holder.__mediaVault === undefined) {
    const key = process.env.VAULT_MASTER_KEY;
    holder.__mediaVault = key && key.length >= 32 ? createVault(getPrisma(), key) : null;
  }
  holder.__mediaDeps ??= mediaRuntime({
    db: getPrisma(),
    settings,
    vault: holder.__mediaVault,
    // Inline mode: the sizes are made right after the answer has gone out (until the image worker runs, PR 6).
    defer: (task) => after(task),
  });
  return holder.__mediaDeps;
}

const isResponse = (v: unknown): v is Response => v instanceof Response;

function mediaFail(e: unknown): Response {
  if (e instanceof MediaError) return fail(mediaHttpStatus(e.code), e.code, e.details);
  return errorResponse(e);
}

function storeIdOf(request: Request): number | null {
  const raw = new URL(request.url).searchParams.get('storeId');
  const id = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(id) && id >= 1 ? id : null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const nullableStr = (v: unknown) => (v === null ? null : str(v));

/**
 * GET /api/admin/media?storeId&q&kind&folder&tag&usage&archived&cursor — search the library.
 * POST (multipart: file, name?, altEn?, altBn?, folder?, tags…) — upload one photo.
 */
export async function mediaLibraryHandler(request: Request, admin: AdminDeps | null, media: MediaDeps | null): Promise<Response> {
  const storeId = storeIdOf(request);
  if (!storeId) return fail(400, 'invalid-store-id');
  const isGet = request.method === 'GET';
  const g = await guardAdmin(request, admin, { permission: isGet ? 'media.read' : 'media.upload', storeId });
  if (isResponse(g)) return g;
  if (!media) return fail(503, 'database-not-configured');
  try {
    if (isGet) {
      const p = new URL(request.url).searchParams;
      const usage = p.get('usage');
      const archived = p.get('archived');
      const input: SearchInput = {
        storeId,
        q: p.get('q'),
        kind: p.get('kind'),
        folder: p.get('folder'),
        tag: p.get('tag'),
        usage: usage === 'used' || usage === 'unused' ? usage : 'any',
        archived: archived === 'only' || archived === 'all' ? archived : 'no',
        cursor: isUuid(p.get('cursor')) ? p.get('cursor') : null,
      };
      return json({ ok: true, ...(await searchMedia(media, g.actor, input)) });
    }
    const maxBytes = await media.settings.value('media.upload.maxBytes', { storeId });
    const declared = Number(request.headers.get('content-length') ?? '0');
    // The form around the file adds a little; anything far beyond the limit is refused before it is read.
    if (declared > maxBytes * 1.05 + 64 * 1024) return fail(413, 'TOO_LARGE', [`max:${maxBytes}`]);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(400, 'INVALID_INPUT', ['file']);
    }
    const file = form.get('file');
    if (!(file instanceof File)) return fail(400, 'INVALID_INPUT', ['file']);
    const field = (k: string) => {
      const v = form.get(k);
      return typeof v === 'string' ? v : undefined;
    };
    const result = await uploadImage(
      media,
      g.actor,
      {
        storeId,
        body: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name || null,
        name: field('name'),
        altEn: field('altEn'),
        altBn: field('altBn'),
        folder: field('folder'),
        tags: form.getAll('tags').filter((t): t is string => typeof t === 'string' && t.trim() !== ''),
      },
      g.ctx,
    );
    return json({ ok: true, ...result }, { status: result.reused ? 200 : 201 });
  } catch (e) {
    return mediaFail(e);
  }
}

/** GET /api/admin/media/:id — the file, its sizes and where it is used. PATCH {altEn?, altBn?, folder?, tags?, archived?, reason?} */
export async function mediaItemHandler(request: Request, admin: AdminDeps | null, media: MediaDeps | null, id: string): Promise<Response> {
  const storeId = storeIdOf(request);
  if (!storeId) return fail(400, 'invalid-store-id');
  if (!isUuid(id)) return fail(404, 'NOT_FOUND');
  const isGet = request.method === 'GET';
  const g = await guardAdmin(request, admin, { permission: isGet ? 'media.read' : 'media.upload', storeId });
  if (isResponse(g)) return g;
  if (!media) return fail(503, 'database-not-configured');
  try {
    if (isGet) return json({ ok: true, media: await getMedia(media, g.actor, { storeId, id }) });
    const { archived, reason, ...rest } = await body(request);
    const patch = {
      altEn: nullableStr(rest.altEn),
      altBn: nullableStr(rest.altBn),
      folder: nullableStr(rest.folder),
      tags: Array.isArray(rest.tags) ? (rest.tags as string[]) : undefined,
    };
    const hasPatch = Object.values(patch).some((v) => v !== undefined);
    let out = hasPatch ? await updateMedia(media, g.actor, { storeId, id }, patch, g.ctx) : undefined;
    if (archived === true) out = await archiveMedia(media, g.actor, { storeId, id }, str(reason) ?? '', g.ctx);
    if (archived === false) out = await restoreMedia(media, g.actor, { storeId, id }, g.ctx);
    if (!out) return fail(400, 'INVALID_INPUT', ['(empty change)']);
    return json({ ok: true, media: out });
  } catch (e) {
    return mediaFail(e);
  }
}

/** GET /api/admin/media/orphans?storeId&cursor — files used nowhere. POST {assetIds[], reason} — archive them (logged). */
export async function mediaOrphansHandler(request: Request, admin: AdminDeps | null, media: MediaDeps | null): Promise<Response> {
  const storeId = storeIdOf(request);
  if (!storeId) return fail(400, 'invalid-store-id');
  const isGet = request.method === 'GET';
  const g = await guardAdmin(request, admin, { permission: isGet ? 'media.read' : 'media.manage', storeId });
  if (isResponse(g)) return g;
  if (!media) return fail(503, 'database-not-configured');
  try {
    if (isGet) {
      const cursor = new URL(request.url).searchParams.get('cursor');
      return json({ ok: true, ...(await findOrphans(media, g.actor, { storeId, cursor: isUuid(cursor) ? cursor : null })) });
    }
    const b = await body(request);
    const ids = Array.isArray(b.assetIds) ? b.assetIds.filter(isUuid) : [];
    if (!Array.isArray(b.assetIds) || ids.length !== b.assetIds.length) return fail(400, 'INVALID_INPUT', ['assetIds']);
    return json({ ok: true, ...(await archiveOrphans(media, g.actor, { storeId, assetIds: ids, reason: str(b.reason) ?? '' }, g.ctx)) });
  } catch (e) {
    return mediaFail(e);
  }
}

/** POST /api/admin/media/regenerate?storeId — remake every size of every photo (after a settings change). */
export async function mediaRegenerateHandler(request: Request, admin: AdminDeps | null, media: MediaDeps | null): Promise<Response> {
  const storeId = storeIdOf(request);
  if (!storeId) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, admin, { permission: 'media.manage', storeId });
  if (isResponse(g)) return g;
  if (!media) return fail(503, 'database-not-configured');
  try {
    return json({ ok: true, processing: await regenerateAll(media, g.actor, { storeId }, g.ctx) }, { status: 202 });
  } catch (e) {
    return mediaFail(e);
  }
}

/**
 * GET /api/admin/media/products/:productId — the product's photos and its photo-minimum status (PR 25).
 * POST {action: 'attach', assetId, role, colourId?, sortOrder?, isPrimary?} | {action: 'detach', productMediaId}
 */
export async function productPhotosHandler(request: Request, admin: AdminDeps | null, media: MediaDeps | null, productId: string): Promise<Response> {
  const storeId = storeIdOf(request);
  if (!storeId) return fail(400, 'invalid-store-id');
  if (!isUuid(productId)) return fail(404, 'NOT_FOUND');
  const isGet = request.method === 'GET';
  const g = await guardAdmin(request, admin, { permission: isGet ? 'media.read' : 'media.upload', storeId });
  if (isResponse(g)) return g;
  if (!media) return fail(503, 'database-not-configured');
  try {
    if (isGet) return json({ ok: true, ...(await productGallery(media, g.actor, { storeId, productId })) });
    const b = await body(request);
    if (b.action === 'attach') {
      if (!isUuid(b.assetId) || (b.colourId != null && !isUuid(b.colourId))) return fail(400, 'INVALID_INPUT', ['assetId', 'colourId']);
      const input: AttachInput = {
        storeId,
        productId,
        assetId: b.assetId,
        role: str(b.role) as AttachInput['role'],
        colourId: (b.colourId as string | null | undefined) ?? null,
        sortOrder: typeof b.sortOrder === 'number' ? b.sortOrder : undefined,
        isPrimary: b.isPrimary === true,
      };
      return json({ ok: true, ...(await attachToProduct(media, g.actor, input, g.ctx)) });
    }
    if (b.action === 'detach') {
      if (!isUuid(b.productMediaId)) return fail(400, 'INVALID_INPUT', ['productMediaId']);
      return json({ ok: true, ...(await detachFromProduct(media, g.actor, { storeId, productId, productMediaId: b.productMediaId }, g.ctx)) });
    }
    return fail(400, 'INVALID_INPUT', ['action']);
  } catch (e) {
    return mediaFail(e);
  }
}

// ---------------------------------------------------------------------------------------------- public (the shop)

/** GET /media/<key> — a rendition file (when no CDN address is set, or the CDN asks this origin). Cached for long. */
export async function mediaFileHandler(_request: Request, media: MediaDeps | null, parts: string[]): Promise<Response> {
  if (!media) return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  const key = parts.map((p) => decodeURIComponent(p)).join('/');
  try {
    const f = await renditionFile(media, key);
    if (!f) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
    const maxAge = await media.settings.value('media.serve.maxAgeSeconds', {});
    return new Response(new Blob([f.body as Uint8Array<ArrayBuffer>], { type: f.contentType }), {
      headers: { 'content-type': f.contentType, 'cache-control': `public, max-age=${maxAge}, immutable`, 'x-content-type-options': 'nosniff' },
    });
  } catch (e) {
    console.warn(`media: serving a file failed (${e instanceof Error ? e.message : String(e)})`);
    return new Response(null, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}

/** GET /api/media/:id/download — the download / save copy of a product photo, with the watermark (PR 23). */
export async function mediaDownloadHandler(_request: Request, media: MediaDeps | null, id: string): Promise<Response> {
  if (!media) return fail(503, 'database-not-configured');
  if (!isUuid(id)) return fail(404, 'NOT_FOUND');
  try {
    const d = await downloadCopy(media, id);
    return new Response(new Blob([d.body as Uint8Array<ArrayBuffer>], { type: d.contentType }), {
      headers: {
        'content-type': d.contentType,
        'content-disposition': `attachment; filename="${d.fileName}"`,
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    return mediaFail(e);
  }
}
