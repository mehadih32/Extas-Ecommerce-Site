// S28 · PR 681 — /media/video/<asset id>: the shop's own product clip (stored as it was uploaded; making it lighter stays a
// mock until a transcoder is connected). Served only while the switch is on and a live product's active video points at
// the file; supports a byte range so a phone can seek. Anything else is a plain 404.
import { getPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import type { MediaDeps } from '@extas/media';
import { settingsResolver } from '../settings';

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const none = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

/** The byte range a `Range` header asks for within `size` bytes; null: the whole file; 'bad': not satisfiable. */
export function byteRange(header: string | null, size: number): { start: number; end: number } | null | 'bad' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'bad';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start > end || start >= size ? 'bad' : { start, end };
}

export async function videoFileResponse(request: Request, media: MediaDeps | null, id: string): Promise<Response> {
  if (!media || !isUuid(id) || !process.env.DATABASE_URL) return none();
  const storeId = MOTHER_STORE_ID;
  try {
    const resolver = settingsResolver();
    const set = resolver ? await resolver.value('catalogue.video', { storeId }) : null;
    if (!set?.on || !set.allowUpload) return none();
    const db = getPrisma();
    const v = await db.productVideo.findFirst({ where: { storeId, fileAssetId: id, archivedAt: null }, select: { productId: true } });
    if (!v) return none();
    const p = await db.product.findFirst({ where: { id: v.productId, storeId, status: 'PUBLISHED', archivedAt: null }, select: { id: true } });
    if (!p) return none();
    const asset = await db.mediaAsset.findFirst({ where: { id, storeId, kind: 'VIDEO', archivedAt: null }, select: { storage: true, storageKey: true, mimeType: true } });
    if (!asset) return none();
    const file = await (await media.storage(storeId, asset.storage)).get(asset.storageKey);
    if (!file) return none();
    const size = file.body.byteLength;
    const r = byteRange(request.headers.get('range'), size);
    const base = { 'content-type': asset.mimeType, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' };
    if (r === 'bad') return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${size}` } });
    if (!r) return new Response(new Blob([file.body as Uint8Array<ArrayBuffer>], { type: asset.mimeType }), { headers: { ...base, 'content-length': String(size) } });
    const part = file.body.slice(r.start, r.end + 1);
    return new Response(new Blob([part as Uint8Array<ArrayBuffer>], { type: asset.mimeType }), {
      status: 206,
      headers: { ...base, 'content-length': String(part.byteLength), 'content-range': `bytes ${r.start}-${r.end}/${size}` },
    });
  } catch {
    return none();
  }
}
