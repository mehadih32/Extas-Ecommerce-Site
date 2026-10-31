// S11 · PR 232 — the photo descriptions on a real PostgreSQL: the shop writes the English one of each product photo
// that has none (a colour's photo names its colour, a true-colour photo too), never a video, never an archived product's,
// never over one the owner typed; Bengali is never written; the add of a photo writes it while the switch is on and not
// when it is off; "Write them now" needs seo.manage and leaves an audit row.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, registry, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import en from '../../../messages/shop.en.json';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { settingsResolver } from '../settings';
import type { AltWords } from './alt-text';
import { autoAltAfterAttach, fillMissingAlt, missingAlt, seoAltTextRoute } from './alt-text-data';

const words: AltWords = (key, vars = {}) =>
  String(key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en)).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const BASE = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.42', origin: `https://${HOST}`, 'content-type': 'application/json' };
const call = (cookie?: string, method = 'POST') => new Request(`https://${HOST}/api/admin/seo/alt-text`, { method, headers: { ...BASE, ...(cookie ? { cookie } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) });
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('photo descriptions on PostgreSQL (PR 232)', () => {
  let t: TestDatabase;
  const savedUrl = process.env.DATABASE_URL;
  const S = MOTHER_STORE_ID;
  const ids: Record<string, string> = {};
  let n = 0;
  const asset = async (more: Record<string, unknown> = {}) =>
    (await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `at/${++n}.jpg`, mimeType: 'image/jpeg', bytes: 100, checksumSha256: `at-${n}`, ...more } })).id;
  const alt = async (id: string) => t.prisma.mediaAsset.findUniqueOrThrow({ where: { id }, select: { altEn: true, altBn: true } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const db = t.prisma;
    const navy = await db.colour.create({ data: { storeId: S, key: 'at-navy', nameEn: 'Navy', nameBn: 'নেভি', hex: '#142050' } });
    const shirt = await db.product.create({ data: { storeId: S, slug: 'at-shirt', nameEn: 'Sample Oxford shirt', status: 'PUBLISHED', publishedAt: new Date() } });
    const old = await db.product.create({ data: { storeId: S, slug: 'at-old', nameEn: 'Sample old shirt', status: 'PUBLISHED', archivedAt: new Date() } });
    ids.shirt = shirt.id;
    ids.front = await asset();
    ids.shared = await asset();
    ids.typed = await asset({ altEn: 'Owner typed this' });
    ids.video = await asset({ kind: 'VIDEO', mimeType: 'video/mp4' });
    ids.old = await asset();
    ids.trueColour = await asset();
    await db.productMedia.createMany({
      data: [
        { storeId: S, productId: shirt.id, assetId: ids.front, colourId: navy.id, role: 'FRONT' },
        { storeId: S, productId: shirt.id, assetId: ids.shared, colourId: null, role: 'FABRIC', sortOrder: 1 },
        { storeId: S, productId: shirt.id, assetId: ids.typed, colourId: navy.id, role: 'BACK', sortOrder: 2 },
        { storeId: S, productId: shirt.id, assetId: ids.video, colourId: null, role: 'VIDEO', sortOrder: 3 },
        { storeId: S, productId: old.id, assetId: ids.old, colourId: null, role: 'FRONT' },
      ],
    });
    await db.productColour.create({ data: { storeId: S, productId: shirt.id, colourId: navy.id, trueColourAssetId: ids.trueColour } });
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
  }, 300_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectPrisma();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    await t?.drop();
  });

  it('writes the English description of each photo with none; never a video, an archived product or a typed one', async () => {
    expect(await missingAlt(t.prisma, S)).toBe(3);
    expect(await fillMissingAlt(t.prisma, S, words, 125)).toBe(3);
    expect(await alt(ids.front!)).toEqual({ altEn: 'Sample Oxford shirt in Navy, Front photo', altBn: null });
    expect((await alt(ids.shared!)).altEn).toBe('Sample Oxford shirt, Fabric photo');
    expect((await alt(ids.trueColour!)).altEn).toBe('Sample Oxford shirt in Navy, True colour photo, daylight, no filter');
    expect((await alt(ids.typed!)).altEn).toBe('Owner typed this');
    expect((await alt(ids.video!)).altEn).toBeNull();
    expect((await alt(ids.old!)).altEn).toBeNull();
    expect(await missingAlt(t.prisma, S)).toBe(0);
    expect(await fillMissingAlt(t.prisma, S, words, 125)).toBe(0);
  });

  it('a photo added to a product gets one while the switch is on, and none when it is off', async () => {
    const on = await asset();
    await t.prisma.productMedia.create({ data: { storeId: S, productId: ids.shirt!, assetId: on, role: 'DETAIL', sortOrder: 4 } });
    await autoAltAfterAttach(S, ids.shirt!);
    expect((await alt(on)).altEn).toBe('Sample Oxford shirt, Detail photo');
    await settingsResolver()!.set('seo.altText', { ...registry['seo.altText'].default, autoApply: false }, storeTarget(S), { actorId: null, reason: 'test' });
    const off = await asset();
    await t.prisma.productMedia.create({ data: { storeId: S, productId: ids.shirt!, assetId: off, role: 'SET', sortOrder: 5 } });
    await autoAltAfterAttach(S, ids.shirt!);
    expect((await alt(off)).altEn).toBeNull();
    expect(await missingAlt(t.prisma, S)).toBe(1);
    ids.off = off;
  });

  it('"Write them now" needs a session with seo.manage, writes every missing one and leaves an audit row', async () => {
    const deps: AdminDeps = { db: t.prisma, resolver: settingsResolver()!, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    expect((await seoAltTextRoute(call(), deps, [])).status).toBe(401);
    const login = await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: BASE, body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PW }) }), deps);
    const owner = cookiesOf(login);
    expect((await seoAltTextRoute(call(owner, 'GET'), deps, [])).status).toBe(405);
    expect((await seoAltTextRoute(call(owner), deps, ['x'])).status).toBe(404);
    const res = await seoAltTextRoute(call(owner), deps, []);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, filled: 1, missing: 0 });
    expect((await alt(ids.off!)).altEn).toBe('Sample Oxford shirt, Set photo');
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.altText.fill' } })).toBe(1);
  });
});
