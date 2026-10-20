// The media API end to end on a real PostgreSQL (PR 22, 23, 24, 25, 37): the guard on every admin route (login,
// permission per action, a missing database), the multipart upload, search, edit, archive, the product photo minimum,
// the orphan list, the public rendition files (never the original) and the watermarked download. A throwaway database
// (skipped without TEST_DATABASE_ADMIN_URL); files go to the memory storage adapter.
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { MediaDeps } from '@extas/media';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from './admin-api';
import type { AdminDeps } from './admin-auth';
import {
  mediaDownloadHandler,
  mediaFileHandler,
  mediaItemHandler,
  mediaLibraryHandler,
  mediaOrphansHandler,
  mediaRegenerateHandler,
  productPhotosHandler,
} from './media';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function headersFor(method: string, cookie?: string): Record<string, string> {
  const h: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.21' };
  if (method !== 'GET') h.origin = `https://${HOST}`;
  if (cookie) h.cookie = cookie;
  return h;
}

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers = headersFor(method, opts.cookie);
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

function upload(path: string, cookie: string, file: Uint8Array, fields: Record<string, string | string[]> = {}) {
  const form = new FormData();
  form.set('file', new File([file as Uint8Array<ArrayBuffer>], 'IMG_0001.JPG', { type: 'image/jpeg' }));
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) form.append(k, one);
  return new Request(`https://${HOST}${path}`, { method: 'POST', headers: headersFor('POST', cookie), body: form });
}

function cookiesOf(res: Response): string {
  return res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
}

/** A sample photo: navy with a white square, so it has a colour and an edge. */
async function photo(width: number, height: number, tint = 0): Promise<Uint8Array> {
  const square = await sharp({ create: { width: Math.round(width / 3), height: Math.round(height / 3), channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  const out = await sharp({ create: { width, height, channels: 3, background: { r: 20 + tint, g: 32, b: 80 } } })
    .composite([{ input: square, left: Math.round(width / 3), top: Math.round(height / 3) }])
    .jpeg({ quality: 90 })
    .toBuffer();
  return new Uint8Array(out);
}

type Json = Record<string, unknown>;
const read = async (res: Response) => (await res.json()) as Json;

describe.skipIf(!HAS_TEST_DB)('media API on PostgreSQL (PR 22, 23, 24, 25, 37)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let media: MediaDeps;
  let stores: [number, number];
  let owner = '';
  let viewer = '';
  let now = new Date('2026-10-20T06:00:00Z');

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('webmedia');
    stores = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry, { checkIntervalMs: 0 });
    await resolver.set('media.image.avifEffort', 0, INSTALLATION); // fast AVIF in tests
    admin = { db: t.prisma, resolver, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    const storage = memoryStorage();
    media = { db: t.prisma, settings: resolver, storage: async () => storage, now: () => now };

    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    // A helper who may only look at the library.
    const role = await read(await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: 'Library viewer', nameBn: 'লাইব্রেরি দেখা', permissions: ['media.read'] } }), admin));
    const staff = await read(await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email: 'viewer@example.com', displayName: 'Sample viewer', password: 'first password from the owner' } }), admin));
    const staffId = (staff.staff as { id: string }).id;
    await staffRolesHandler(call('POST', `/api/admin/staff/${staffId}/roles`, { cookie: owner, body: { action: 'assign', roleId: (role.role as { id: string }).id, storeId: stores[0] } }), admin, staffId);
    const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'viewer@example.com', password: 'first password from the owner' } }), admin));
    viewer = cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const lib = (s = stores[0]) => `/api/admin/media?storeId=${s}`;

  it('every admin route needs a login, the right permission and a database', async () => {
    expect((await mediaLibraryHandler(call('GET', lib()), admin, media)).status).toBe(401);
    expect((await mediaLibraryHandler(call('GET', lib(), { cookie: owner }), admin, null)).status).toBe(503);
    expect((await mediaLibraryHandler(call('GET', '/api/admin/media?storeId=x', { cookie: owner }), admin, media)).status).toBe(400);
    // the viewer may look, but not upload, archive orphans or remake sizes; and only in the store the role is for
    expect((await mediaLibraryHandler(call('GET', lib(), { cookie: viewer }), admin, media)).status).toBe(200);
    expect((await mediaLibraryHandler(call('GET', lib(stores[1]), { cookie: viewer }), admin, media)).status).toBe(403);
    expect((await mediaLibraryHandler(upload(lib(), viewer, await photo(1200, 1500)), admin, media)).status).toBe(403);
    expect((await mediaOrphansHandler(call('POST', `/api/admin/media/orphans?storeId=${stores[0]}`, { cookie: viewer, body: { assetIds: [], reason: 'x' } }), admin, media)).status).toBe(403);
    expect((await mediaRegenerateHandler(call('POST', `/api/admin/media/regenerate?storeId=${stores[0]}`, { cookie: viewer }), admin, media)).status).toBe(403);
  });

  const ids: Record<string, string> = {};

  it('uploads over multipart: 201 with 15 sizes; the same photo again is reused (200); a small photo is refused', async () => {
    const res = await mediaLibraryHandler(upload(lib(), owner, await photo(1600, 2000), { name: 'Polo navy front', altEn: 'Navy polo, front', tags: ['polo', 'navy'] }), admin, media);
    expect(res.status).toBe(201);
    const b = await read(res);
    const asset = b.asset as { id: string; status: string; renditions: number; tags: string[] };
    expect([asset.status, asset.renditions, asset.tags]).toEqual(['ready', 15, ['polo', 'navy']]);
    ids.front = asset.id;
    const again = await mediaLibraryHandler(upload(lib(), owner, await photo(1600, 2000)), admin, media);
    expect(again.status).toBe(200);
    expect(((await read(again)).asset as { id: string }).id).toBe(ids.front);
    const small = await mediaLibraryHandler(upload(lib(), owner, await photo(600, 750)), admin, media);
    expect([small.status, (await read(small)).error]).toEqual([400, 'TOO_SMALL']);
    for (const [role, tint] of [['back', 10], ['detail', 20], ['model', 30], ['spare', 40]] as const) {
      const r = await mediaLibraryHandler(upload(lib(), owner, await photo(1200, 1500, tint), { name: `polo ${role}` }), admin, media);
      expect(r.status).toBe(201);
      ids[role] = ((await read(r)).asset as { id: string }).id;
    }
  });

  it('search, read one file and edit its alt text, folder and tags', async () => {
    const found = await read(await mediaLibraryHandler(call('GET', `${lib()}&q=front`, { cookie: viewer }), admin, media));
    expect((found.items as { id: string }[]).map((i) => i.id)).toEqual([ids.front]);
    const one = await mediaItemHandler(call('GET', `/api/admin/media/${ids.front}?storeId=${stores[0]}`, { cookie: owner }), admin, media, ids.front!);
    expect(one.status).toBe(200);
    expect(((await read(one)).media as { uses: unknown[] }).uses).toEqual([]);
    const patched = await mediaItemHandler(call('PATCH', `/api/admin/media/${ids.front}?storeId=${stores[0]}`, { cookie: owner, body: { altBn: 'নেভি পোলো, সামনে', folder: 'polo', tags: ['summer'] } }), admin, media, ids.front!);
    expect(patched.status).toBe(200);
    expect(((await read(patched)).media as { altBn: string; folder: string }).folder).toBe('polo');
    expect((await mediaItemHandler(call('PATCH', `/api/admin/media/${ids.front}?storeId=${stores[0]}`, { cookie: owner, body: {} }), admin, media, ids.front!)).status).toBe(400);
    expect((await mediaItemHandler(call('GET', `/api/admin/media/not-an-id?storeId=${stores[0]}`, { cookie: owner }), admin, media, 'not-an-id')).status).toBe(404);
    // another store does not see this file
    expect((await mediaItemHandler(call('GET', `/api/admin/media/${ids.front}?storeId=${stores[1]}`, { cookie: owner }), admin, media, ids.front!)).status).toBe(404);
  });

  let product = '';

  it('product photos: the minimum of four (front, back, detail, on-model), attach, detach', async () => {
    product = (await t.prisma.product.create({ data: { storeId: stores[0], slug: 'sample-polo', nameEn: 'Sample polo' } })).id;
    const path = `/api/admin/media/products/${product}?storeId=${stores[0]}`;
    const empty = await read(await productPhotosHandler(call('GET', path, { cookie: owner }), admin, media, product));
    expect((empty.status as { ok: boolean; missing: string[] }).missing).toEqual(['FRONT', 'BACK', 'DETAIL', 'ON_MODEL']);
    for (const [assetId, role] of [[ids.front, 'FRONT'], [ids.back, 'BACK'], [ids.detail, 'DETAIL'], [ids.model, 'ON_MODEL'], [ids.spare, 'FLAT_LAY']] as const) {
      const r = await productPhotosHandler(call('POST', path, { cookie: owner, body: { action: 'attach', assetId, role } }), admin, media, product);
      expect(r.status, role).toBe(200);
    }
    const full = await read(await productPhotosHandler(call('GET', path, { cookie: owner }), admin, media, product));
    expect((full.status as { ok: boolean }).ok).toBe(true);
    const spareLink = (full.photos as { id: string; assetId: string }[]).find((p) => p.assetId === ids.spare)!;
    const off = await productPhotosHandler(call('POST', path, { cookie: owner, body: { action: 'detach', productMediaId: spareLink.id } }), admin, media, product);
    expect(off.status).toBe(200);
    expect((await productPhotosHandler(call('POST', path, { cookie: viewer, body: { action: 'detach', productMediaId: spareLink.id } }), admin, media, product)).status).toBe(403);
    expect((await productPhotosHandler(call('POST', path, { cookie: owner, body: { action: 'paint' } }), admin, media, product)).status).toBe(400);
    // a file in use cannot be archived
    const busy = await mediaItemHandler(call('PATCH', `/api/admin/media/${ids.front}?storeId=${stores[0]}`, { cookie: owner, body: { archived: true, reason: 'tidy up' } }), admin, media, ids.front!);
    expect([busy.status, (await read(busy)).error]).toEqual([409, 'STILL_IN_USE']);
  });

  it('orphans: only unused files past the grace days; archiving them is logged and nothing leaves storage', async () => {
    const path = `/api/admin/media/orphans?storeId=${stores[0]}`;
    expect(((await read(await mediaOrphansHandler(call('GET', path, { cookie: owner }), admin, media))).items as unknown[])).toEqual([]);
    now = new Date(now.getTime() + 31 * 24 * 3600 * 1000);
    const list = await read(await mediaOrphansHandler(call('GET', path, { cookie: owner }), admin, media));
    expect((list.items as { id: string }[]).map((i) => i.id)).toEqual([ids.spare]);
    expect((await mediaOrphansHandler(call('POST', path, { cookie: owner, body: { assetIds: ['nope'], reason: 'x' } }), admin, media)).status).toBe(400);
    const done = await mediaOrphansHandler(call('POST', path, { cookie: owner, body: { assetIds: [ids.spare, ids.front], reason: 'unused after the shoot' } }), admin, media);
    expect(done.status).toBe(200);
    const out = await read(done);
    expect(out.archived).toEqual([ids.spare]);
    expect((out.skipped as { id: string; why: string }[]).map((s) => s.why)).toEqual(['IN_USE']);
    expect(await t.prisma.auditLog.count({ where: { action: 'media.orphan.archive' } })).toBe(1);
    // restorable
    const back = await mediaItemHandler(call('PATCH', `/api/admin/media/${ids.spare}?storeId=${stores[0]}`, { cookie: owner, body: { archived: false } }), admin, media, ids.spare!);
    expect(back.status).toBe(200);
    expect(await t.prisma.mediaAsset.count({ where: { id: ids.spare, archivedAt: null } })).toBe(1);
  });

  it('remake every size after a settings change: 202', async () => {
    const res = await mediaRegenerateHandler(call('POST', `/api/admin/media/regenerate?storeId=${stores[0]}`, { cookie: owner }), admin, media);
    expect(res.status).toBe(202);
  });

  it('the shop serves the sizes by name with a long cache, never the original', async () => {
    const a = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: ids.front }, include: { renditions: true } });
    const card = a.renditions.find((r) => r.preset === 'card' && r.format === 'webp')!;
    const res = await mediaFileHandler(call('GET', `/media/${card.storageKey}`), media, card.storageKey.split('/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe(`public, max-age=${registry['media.serve.maxAgeSeconds'].default}, immutable`);
    expect((await res.arrayBuffer()).byteLength).toBe(card.bytes);
    expect((await mediaFileHandler(call('GET', `/media/${a.storageKey}`), media, a.storageKey.split('/'))).status).toBe(404);
    expect((await mediaFileHandler(call('GET', '/media/x'), null, ['x'])).status).toBe(503);
  });

  it('the download copy: an attachment, not cached, not indexed, watermarked; a photo on no product is not offered', async () => {
    const res = await mediaDownloadHandler(call('GET', `/api/media/${ids.front}/download`), media, ids.front!);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="[a-z0-9-]+\.jpg"$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('jpeg');
    expect((await mediaDownloadHandler(call('GET', `/api/media/${ids.spare}/download`), media, ids.spare!)).status).toBe(404);
    expect((await mediaDownloadHandler(call('GET', '/api/media/x/download'), media, 'x')).status).toBe(404);
  });
});
