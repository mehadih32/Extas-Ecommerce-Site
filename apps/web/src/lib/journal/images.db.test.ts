// S12 · PR 547 — an article's main photo on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the picker
// offers the article's own product photos first (in the block's order, primary first, each picture once), then the
// rest of the library; a studio (AI-made) picture only while allowed; picking one (audited), a picture of no use
// (another store's, put away, a video) refused, a studio one refused while not allowed; taking it off; the card; the
// shop shows the photo only while the card is on and the picture is rendered, a studio one labelled; signed out 401.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { articlePhoto, photoHandler } from './images';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.54' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Main photo on PostgreSQL (PR 547)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const S = MOTHER_STORE_ID;
  const ids: Record<string, string> = {};
  const api = async (method: string, q: string, body?: unknown, cookie = owner) => {
    const r = await photoHandler(call(method, `/api/admin/blog/photo${q}`, cookie, body), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  let n = 0;
  const asset = async (o: { ai?: boolean; kind?: 'IMAGE' | 'VIDEO'; archived?: boolean; rendered?: boolean; store?: number } = {}) => {
    n += 1;
    const a = await t.prisma.mediaAsset.create({
      data: { storeId: o.store ?? S, kind: o.kind ?? 'IMAGE', storage: 'LOCAL_DISK', storageKey: `sample/${n}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: `sum${n}`.padEnd(64, '0'), isAiGenerated: !!o.ai, altEn: `Sample photo ${n}`, archivedAt: o.archived ? new Date() : null },
    });
    if (o.rendered) await t.prisma.mediaRendition.create({ data: { storeId: o.store ?? S, assetId: a.id, preset: 'main', format: 'jpeg', width: 1200, height: 1500, bytes: 900, storageKey: `r/${n}.jpg` } });
    return a.id;
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('blog_photo');
    const stores = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const brand = await t.prisma.brand.findFirst({ where: { storeId: S }, select: { id: true } });
    const product = async (slug: string, nameEn: string) => (await t.prisma.product.create({ data: { storeId: S, slug, nameEn, nameBn: `${nameEn} (বাংলা)`, ...(brand ? { brandId: brand.id } : {}) } as never })).id;
    ids.polo = await product('ph-polo', 'Blue polo');
    ids.chino = await product('ph-chino', 'Black chino');
    ids.lib = await asset({ rendered: true });
    ids.poloBack = await asset();
    ids.poloFront = await asset({ rendered: true });
    ids.chinoFront = await asset();
    ids.studio = await asset({ ai: true, rendered: true });
    ids.away = await asset({ archived: true });
    ids.video = await asset({ kind: 'VIDEO' });
    if (stores[1]) ids.other = await asset({ store: stores[1] });
    const pm = (productId: string, assetId: string, isPrimary: boolean, sortOrder: number) => t.prisma.productMedia.create({ data: { storeId: S, productId, assetId, role: isPrimary ? 'FRONT' : 'BACK', isPrimary, sortOrder } });
    await pm(ids.polo, ids.poloBack, false, 2);
    await pm(ids.polo, ids.poloFront, true, 1);
    await pm(ids.chino, ids.chinoFront, true, 1);
    ids.post = (await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug: 'ph-wash', title: 'How to wash a polo', body: 'Sample.', status: 'PUBLISHED', publishedAt: new Date('2026-11-01T00:00:00Z'), productIds: [ids.chino, ids.polo] } })).id;
  });
  afterAll(async () => t?.drop());

  it('offers the article\u2019s product photos first, then the library, studio pictures only while allowed', async () => {
    const s = (await api('GET', `?id=${ids.post}`)).j.screen;
    expect(s.post).toMatchObject({ heroAssetId: null, products: 2 });
    expect(s.current).toBeNull();
    expect(s.sources.products.map((p: any) => p.id)).toEqual([ids.chinoFront, ids.poloFront, ids.poloBack]);
    expect(s.sources.products[0].productName).toBe('Black chino');
    expect(s.sources.library.map((p: any) => p.id)).toEqual([ids.lib]);
    expect(s.sources.library[0].image).toBeTruthy();
    expect(s.sources.products[2].image).toBeNull();
    expect(s.card.value).toEqual({ show: false, studio: false, perSource: 24 });
    expect((await api('GET', '?id=0190a0a0-0000-7000-8000-000000000001')).status).toBe(404);
  });

  it('picks a photo (audited), refuses one of no use, a studio one while not allowed, and takes it off', async () => {
    expect((await api('PUT', '', { id: ids.post, assetId: ids.poloFront })).j.screen.current).toMatchObject({ id: ids.poloFront, source: 'products' });
    for (const bad of [ids.away, ids.video, ids.other, 'not-an-id'].filter(Boolean)) expect((await api('PUT', '', { id: ids.post, assetId: bad })).j.error, bad).toBe('INVALID_INPUT');
    expect((await api('PUT', '', { id: ids.post, assetId: ids.studio })).j.error).toBe('STUDIO_OFF');
    expect((await api('PUT', '', { id: ids.post, assetId: 42 })).j.error).toBe('INVALID_INPUT');
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.post.photo', entityId: ids.post } })).toBe(1);
    const off = (await api('PUT', '', { id: ids.post, assetId: null })).j.screen;
    expect(off.current).toBeNull();
    expect((await t.prisma.blogPost.findUnique({ where: { id: ids.post }, select: { heroAssetId: true } }))?.heroAssetId).toBeNull();
    expect(await t.prisma.mediaAsset.count({ where: { id: ids.poloFront } })).toBe(1);
  });

  it('the shop shows the photo only while the card is on; a studio picture only while allowed, labelled', async () => {
    await api('PUT', '', { id: ids.post, assetId: ids.poloFront });
    expect(await articlePhoto(t.prisma, deps.resolver, S, ids.poloFront!, 'en')).toBeNull();
    expect((await api('PUT', '', { key: 'blog.images', on: true, values: { perSource: 4 } })).status).toBe(200);
    expect((await api('PUT', '', { key: 'blog.images', on: true, values: { perSource: 3 } })).j.error).toBe('INVALID_INPUT');
    expect(await articlePhoto(t.prisma, deps.resolver, S, ids.poloFront!, 'en')).toMatchObject({ alt: expect.stringMatching(/^Sample photo/), studio: false });
    expect(await articlePhoto(t.prisma, deps.resolver, S, ids.poloBack!, 'en')).toBeNull();
    expect(await articlePhoto(t.prisma, deps.resolver, S, null, 'en')).toBeNull();
    await api('PUT', '', { key: 'blog.images', on: true, values: { studio: 'yes' } });
    expect((await api('PUT', '', { id: ids.post, assetId: ids.studio })).j.screen.current).toMatchObject({ id: ids.studio, studio: true });
    expect(await articlePhoto(t.prisma, deps.resolver, S, ids.studio!, 'en')).toMatchObject({ studio: true });
    const s = (await api('GET', `?id=${ids.post}`)).j.screen;
    expect(s.sources.products).toHaveLength(3);
    expect(s.sources.library.map((p: any) => p.id)).toEqual([ids.studio, ids.lib]);
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.images.settings' } })).toBe(2);
  });

  it('signed out is 401; a wrong method 405', async () => {
    expect((await api('GET', `?id=${ids.post}`, undefined, '')).status).toBe(401);
    expect((await api('POST', '', {})).status).toBe(405);
  });
});
