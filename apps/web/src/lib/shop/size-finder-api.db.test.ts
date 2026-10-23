// PR 58 (PR 59's data hook) — Find My Size's answers on a real PostgreSQL (a throwaway database with the sample
// catalogue; skipped without TEST_DATABASE_ADMIN_URL): the server works the size out again from the product's own chart
// (a page cannot record a size the chart never gave), the row keeps the body, the size and the reasons with no name or
// visitor, a product without a chart gets no size, the size taken is kept once, and only from the same site.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma } from '@extas/db/client';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { productData } from './product';
import { sizeFinderHandler, type FinderDeps } from './size-finder-api';

const ORIGIN = 'https://shop.example.test';

describe.skipIf(!HAS_TEST_DB)('the Find My Size record on PostgreSQL (PR 58)', () => {
  let t: TestDatabase;
  let S = 0;
  const saved = process.env.DATABASE_URL;
  const overrides = new Map<string, unknown>();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): FinderDeps => ({ db: t.prisma, settings, storeId: S, product: productData });
  const ids: Record<string, string> = {};

  const req = (method: string, body: unknown, site = 'same-origin') =>
    new Request(`${ORIGIN}/api/size-finder`, { method, headers: { 'sec-fetch-site': site, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as { ok: boolean; id?: string; size?: string; updated?: number; error?: string; details?: string[] } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('size_finder');
    S = (await seedSample(t.prisma)).storeId;
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    for (const slug of ['essential-pique-polo', 'cotton-socks-3']) {
      const p = await t.prisma.product.findUniqueOrThrow({ where: { storeId_slug: { storeId: S, slug } }, select: { id: true } });
      ids[slug] = p.id;
    }
  }, 180_000);

  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it("records 5'7\" · 66 kg on the polo as L, worked out on the server from the owner's chart", async () => {
    const r = await read(await sizeFinderHandler(req('POST', { productId: ids['essential-pique-polo'], heightIn: 67, weightKg: 66 }), deps()));
    expect(r.status).toBe(200);
    expect(r.body.size).toBe('l');
    const row = await t.prisma.sizeRecommendation.findUniqueOrThrow({ where: { id: r.body.id! } });
    const l = await t.prisma.size.findFirstOrThrow({ where: { storeId: S, key: 'l' } });
    expect(row).toMatchObject({ storeId: S, productId: ids['essential-pique-polo'], heightCm: 170, weightKg: 66, recommendedSizeId: l.id, chosenSizeId: null, visitorId: null });
    expect(row.reasoning).toMatchObject({ engine: 'rules', size: 'l', field: 'chest', value: 42, need: 41.1, ease: 4, covered: true, length: { verdict: 'ok' } });
  });

  it('keeps the size the shopper took, once', async () => {
    const { body } = await read(await sizeFinderHandler(req('POST', { productId: ids['essential-pique-polo'], heightIn: 70, weightKg: 80 }), deps()));
    const first = await read(await sizeFinderHandler(req('PATCH', { id: body.id, size: 'xl' }), deps()));
    expect(first.body.updated).toBe(1);
    const again = await read(await sizeFinderHandler(req('PATCH', { id: body.id, size: 'm' }), deps()));
    expect(again.body.updated).toBe(0);
    const xl = await t.prisma.size.findFirstOrThrow({ where: { storeId: S, key: 'xl' } });
    expect((await t.prisma.sizeRecommendation.findUniqueOrThrow({ where: { id: body.id! } })).chosenSizeId).toBe(xl.id);
    expect((await read(await sizeFinderHandler(req('PATCH', { id: body.id, size: 'nope' }), deps()))).status).toBe(400);
  });

  it('a product without a size chart gets no size (never an invented one)', async () => {
    const r = await read(await sizeFinderHandler(req('POST', { productId: ids['cotton-socks-3'], heightIn: 67, weightKg: 66 }), deps()));
    expect([r.status, r.body.error]).toEqual([422, 'NO_SIZE_CHART']);
  });

  it('refuses another site, a body out of range, an unknown product, and answers nothing while recording is off', async () => {
    const before = await t.prisma.sizeRecommendation.count();
    expect((await sizeFinderHandler(req('POST', { productId: ids['essential-pique-polo'], heightIn: 67, weightKg: 66 }, 'cross-site'), deps())).status).toBe(403);
    const bad = await read(await sizeFinderHandler(req('POST', { productId: 'x', heightIn: 20, weightKg: 66.5 }), deps()));
    expect([bad.status, bad.body.details]).toEqual([400, ['productId', 'heightIn', 'weightKg']]);
    expect((await sizeFinderHandler(req('POST', { productId: '0199a3b2-1111-7000-8000-00000000dead', heightIn: 67, weightKg: 66 }), deps())).status).toBe(404);
    expect((await sizeFinderHandler(new Request(`${ORIGIN}/api/size-finder`, { method: 'GET' }), deps())).status).toBe(405);
    overrides.set('pdp.finder', { ...registry['pdp.finder'].default, record: false });
    expect((await sizeFinderHandler(req('POST', { productId: ids['essential-pique-polo'], heightIn: 67, weightKg: 66 }), deps())).status).toBe(404);
    overrides.clear();
    expect(await t.prisma.sizeRecommendation.count()).toBe(before);
  });
});
