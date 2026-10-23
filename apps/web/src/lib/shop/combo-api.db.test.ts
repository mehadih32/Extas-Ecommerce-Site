// PR 91–95 — the combo page's API on a real PostgreSQL (the sample catalogue and combos; skipped without
// TEST_DATABASE_ADMIN_URL), called the way the page calls it: a whole set into the bag (one tap is one add, its key
// sent again is the same add), the set changed in the bag, the page's counts, and the price of exact picks — always
// the engine's price, never the browser's. Same-site only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { priceSet, setSummary, type SetSummary } from '@extas/combos';
import { seedSampleCombos } from '@extas/combos/sample';
import { disconnectPrisma } from '@extas/db/client';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import type { SettingsReader } from '@extas/cart';
import { comboEventHandler, setHandler, type BagApiDeps } from './bag-api';

const ORIGIN = 'https://shop.example.test';

describe.skipIf(!HAS_TEST_DB)('the combo page API on PostgreSQL (S03)', () => {
  let t: TestDatabase;
  let S = 0;
  const clock = new Date('2026-10-23T06:00:00Z');
  const saved = process.env.DATABASE_URL;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): BagApiDeps => ({ cart: { db: t.prisma, settings, now: () => clock }, storeId: S });
  let sum: SetSummary;
  const choices = () => sum.pieces.map((p) => ({ colourId: p.defaultColourId, sizeId: (p.defaultColourId && p.openSizes[p.defaultColourId]?.[0]) || null }));

  const req = (method: string, path: string, o: { body?: unknown; cookie?: string; site?: string } = {}) =>
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { 'sec-fetch-site': o.site ?? 'same-origin', 'content-type': 'application/json', ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
  const jar = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('combo_api');
    S = (await seedSample(t.prisma)).storeId;
    await seedSampleCombos({ db: t.prisma, settings, now: () => clock });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    const combo = await t.prisma.combo.findFirst({ where: { storeId: S, status: 'RUNNING', archivedAt: null, autoRuleId: null }, orderBy: { sortRank: 'desc' }, select: { slug: true } });
    sum = await setSummary({ db: t.prisma, settings, now: () => clock }, { storeId: S, slug: combo!.slug });
  }, 180_000);

  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('PR 91 · "Add set to Bag" puts the set in as one set at the engine price; the same tap key again adds nothing', async () => {
    const body = { slug: sum.slug, choices: choices(), addKey: 'tap-0001-abcdef' };
    const first = await setHandler(req('POST', '/api/bag/sets', { body }), deps());
    const a = await read(first);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ ok: true, added: true, count: sum.pieces.length });
    expect(typeof a.body.lineId).toBe('string');
    const cookie = jar(first);
    const again = await read(await setHandler(req('POST', '/api/bag/sets', { body, cookie }), deps()));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ added: false, groupKey: a.body.groupKey, count: sum.pieces.length });
    const priced = await priceSet({ db: t.prisma, settings, now: () => clock }, { storeId: S, slug: sum.slug, choices: choices() });
    expect(a.body.setPriceMinor).toBe(priced.price?.payMinor);
  });

  it('PR 95 · "Update set in bag" changes the set in place; a set that is not in this bag is refused', async () => {
    const added = await setHandler(req('POST', '/api/bag/sets', { body: { slug: sum.slug, choices: choices(), addKey: 'tap-0002-abcdef' } }), deps());
    const cookie = jar(added);
    const { body } = await read(added);
    const p0 = sum.pieces[0]!;
    const other = p0.defaultColourId ? (p0.openSizes[p0.defaultColourId] ?? [])[1] : undefined;
    const next = choices().map((c, i) => (i === 0 && other ? { ...c, sizeId: other } : c));
    const changed = await read(await setHandler(req('PATCH', '/api/bag/sets', { body: { groupKey: body.groupKey, choices: next }, cookie }), deps()));
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ ok: true, groupKey: body.groupKey, count: sum.pieces.length });
    const missing = await read(await setHandler(req('PATCH', '/api/bag/sets', { body: { groupKey: 'set-nope', choices: next }, cookie }), deps()));
    expect(missing.status).toBe(404);
  });

  it('same-site only, and only POST / PATCH', async () => {
    expect((await setHandler(req('POST', '/api/bag/sets', { body: { slug: sum.slug, choices: choices() }, site: 'cross-site' }), deps())).status).toBe(403);
    expect((await setHandler(req('GET', '/api/bag/sets'), deps())).status).toBe(405);
    expect((await comboEventHandler(req('POST', '/api/shop/combo', { body: { event: 'view', comboId: sum.comboId }, site: 'cross-site' }), deps())).status).toBe(403);
  });

  it('PR 104 · the page counts its opening and each colour pick; the price of exact picks is the engine price', async () => {
    const before = await t.prisma.comboDailyStat.aggregate({ where: { comboId: sum.comboId }, _sum: { views: true, picks: true } });
    expect((await comboEventHandler(req('POST', '/api/shop/combo', { body: { event: 'view', comboId: sum.comboId } }), deps())).status).toBe(200);
    const colourIds = choices().map((c) => c.colourId);
    expect((await comboEventHandler(req('POST', '/api/shop/combo', { body: { event: 'pick', comboId: sum.comboId, colourIds } }), deps())).status).toBe(200);
    const after = await t.prisma.comboDailyStat.aggregate({ where: { comboId: sum.comboId }, _sum: { views: true, picks: true } });
    expect((after._sum.views ?? 0) - (before._sum.views ?? 0)).toBe(1);
    expect((after._sum.picks ?? 0) - (before._sum.picks ?? 0)).toBe(1);
    const price = await read(await comboEventHandler(req('POST', '/api/shop/combo', { body: { event: 'price', comboId: sum.comboId, choices: choices() } }), deps()));
    const priced = await priceSet({ db: t.prisma, settings, now: () => clock }, { storeId: S, comboId: sum.comboId, choices: choices() });
    expect(price.body).toMatchObject({ ok: true, price: { pay: priced.price?.payMinor, regular: priced.price?.regularMinor } });
    expect((await comboEventHandler(req('POST', '/api/shop/combo', { body: { event: 'nope', comboId: sum.comboId } }), deps())).status).toBe(400);
  });
});
