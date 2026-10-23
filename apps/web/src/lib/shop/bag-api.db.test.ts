// PR 105–112 — the bag's public API on a real PostgreSQL (a throwaway database with the sample catalogue and the sample
// combos; skipped without TEST_DATABASE_ADMIN_URL), called the way the browser calls it: the visitor cookie made on
// the first add and sent back after, both cookies refreshed on every answer, same-site only, small bodies only, and
// the engine's refusal codes passed through for the shop's words. Also the bag's catalogue reads (pictures, picks).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { productFacts, type ProductFact } from '@extas/combos';
import { seedSampleCombos } from '@extas/combos/sample';
import { disconnectPrisma } from '@extas/db/client';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import type { SettingsReader } from '@extas/cart';
import { addLineHandler, codeHandler, deleteLineHandler, patchLineHandler, restoreLineHandler, sizeAnswerHandler, tryFillHandler, type BagApiDeps } from './bag-api';
import { BAG_COOKIE, COUNT_COOKIE } from './bag-model';
import { bagPickCards, cardsByIds } from './catalogue';

const ORIGIN = 'https://shop.example.test';

describe.skipIf(!HAS_TEST_DB)('the bag API on PostgreSQL (S04)', () => {
  let t: TestDatabase;
  let S = 0;
  let clock = new Date('2026-10-23T06:00:00Z');
  const saved = process.env.DATABASE_URL;
  const overrides = new Map<string, unknown>([['rules.public.cacheSeconds', 0]]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): BagApiDeps => ({ cart: { db: t.prisma, settings, now: () => clock }, storeId: S });
  const products: Record<string, ProductFact> = {};
  const variant = (slug: string, colour: string, size: string) => {
    const p = products[slug]!;
    const c = p.colours.find((x) => x.key === colour)!.id;
    const s = p.sizes.find((x) => x.label === size)!.id;
    return p.variants.find((v) => v.colourId === c && v.sizeId === s)!;
  };

  /** A browser request: same site unless told otherwise, with the cookies it holds. */
  const req = (method: string, path: string, o: { body?: unknown; cookie?: string; site?: string; raw?: string } = {}) =>
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        'sec-fetch-site': o.site ?? 'same-origin',
        ...(o.cookie ? { cookie: o.cookie } : {}),
        ...(o.body !== undefined || o.raw ? { 'content-type': 'application/json' } : {}),
      },
      body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
    });
  /** The cookies an answer sets, as the browser would send them back. */
  const jar = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('bag_api');
    S = (await seedSample(t.prisma)).storeId;
    await seedSampleCombos({ db: t.prisma, settings, now: () => clock });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    const ids = (await t.prisma.product.findMany({ where: { storeId: S }, select: { id: true } })).map((p) => p.id);
    for (const p of (await productFacts({ db: t.prisma, settings }, S, ids)).values()) products[p.slug] = p;
  }, 180_000);

  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('PR 105 · the first add makes the bag and its cookie; the answer carries the count, both cookies are HttpOnly, Secure, SameSite=Lax', async () => {
    const v = variant('oxford-cotton-shirt', 'sky', 'M');
    const r = await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: v.id } }), deps());
    const cookies = r.headers.getSetCookie();
    const { status, body } = await read(r);
    expect(status).toBe(201);
    expect(body).toMatchObject({ ok: true, added: true, quantity: 1, count: 1 });
    expect(cookies.find((c) => c.startsWith(`${BAG_COOKIE}=`))).toMatch(/; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
    expect(cookies.find((c) => c.startsWith(`${COUNT_COOKIE}=1;`))).toBeTruthy();
    // The same tap again is one add; after the guard, the same item again is "already in your bag" (bag.duplicateAdd).
    const again = await read(await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: v.id }, cookie: jar(r) }), deps()));
    expect(again.body).toMatchObject({ added: false, reason: 'REPEAT', count: 1 });
    clock = new Date(clock.getTime() + 2000);
    const third = await read(await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: v.id }, cookie: jar(r) }), deps()));
    expect(third.body).toMatchObject({ added: false, reason: 'ALREADY', count: 1 });
  });

  it('PR 105 / 107 · quantity, colour or size, save for later, take out and Undo — each answer has the new count', async () => {
    const first = await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: variant('essential-pique-polo', 'navy', 'M').id } }), deps());
    const cookie = jar(first);
    const lineId = (await read(first)).body.lineId as string;
    const patch = (body: unknown) => patchLineHandler(req('PATCH', `/api/bag/lines/${lineId}`, { body, cookie }), deps(), lineId).then(read);
    expect((await patch({ quantity: 3 })).body).toMatchObject({ quantity: 3, count: 3 });
    expect((await patch({ quantity: 2, saved: true })).status).toBe(400);
    expect((await patch({ quantity: 100_000 })).status).toBe(400);
    const tooMany = await patch({ quantity: 9_999 });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toMatch(/OUT_OF_STOCK|TOO_MANY/);
    expect((await patch({ quantity: 1 })).body).toMatchObject({ quantity: 1, count: 1 });
    expect((await patch({ variantId: variant('essential-pique-polo', 'navy', 'L').id })).body).toMatchObject({ joined: false, count: 1 });
    expect((await patch({ saved: true })).body).toMatchObject({ count: 0 });
    expect((await patch({ saved: false })).body).toMatchObject({ count: 1 });
    const out = await read(await deleteLineHandler(req('DELETE', `/api/bag/lines/${lineId}`, { cookie }), deps(), lineId));
    expect(out.body).toMatchObject({ lineIds: [lineId], count: 0 });
    // Archived, never deleted: Undo puts the same line back.
    expect(await t.prisma.cartItem.findUniqueOrThrow({ where: { id: lineId }, select: { removedAt: true } })).not.toMatchObject({ removedAt: null });
    const back = await read(await restoreLineHandler(req('POST', `/api/bag/lines/${lineId}/restore`, { cookie }), deps(), lineId));
    expect(back.body).toMatchObject({ lineIds: [lineId], count: 1 });
  });

  it('PR 110 / 112 · the two-sizes answer and the typed code are kept on the bag', async () => {
    const first = await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: variant('oxford-cotton-shirt', 'sky', 'L').id } }), deps());
    const cookie = jar(first);
    const sizes = await read(await sizeAnswerHandler(req('PUT', '/api/bag/sizes', { body: { key: 'p|c|a+b', answer: 'other' }, cookie }), deps()));
    expect(sizes.body.answers).toEqual({ 'p|c|a+b': 'other' });
    expect((await read(await sizeAnswerHandler(req('PUT', '/api/bag/sizes', { body: { key: 'p|c|a+b', answer: 'maybe' }, cookie }), deps()))).status).toBe(400);
    const code = await read(await codeHandler(req('POST', '/api/bag/code', { body: { code: ' eid10 ' }, cookie }), deps()));
    expect(code.body).toMatchObject({ code: 'EID10' });
    expect((await read(await codeHandler(req('DELETE', '/api/bag/code', { cookie }), deps()))).body).toMatchObject({ code: null });
  });

  it('only this site, only small bodies, only with a database; another browser has no bag to change', async () => {
    const v = variant('oxford-cotton-shirt', 'sky', 'M');
    expect((await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: v.id }, site: 'cross-site' }), deps())).status).toBe(403);
    const big = new Request(`${ORIGIN}/api/bag/lines`, { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'content-length': '5000' }, body: 'x'.repeat(5000) });
    expect((await addLineHandler(big, deps())).status).toBe(413);
    expect((await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: v.id } }), null)).status).toBe(503);
    expect((await addLineHandler(req('GET', '/api/bag/lines'), deps())).status).toBe(405);
    const id = '00000000-0000-4000-8000-000000000000';
    expect((await patchLineHandler(req('PATCH', `/api/bag/lines/${id}`, { body: { quantity: 2 } }), deps(), id)).status).toBe(404);
    expect((await patchLineHandler(req('PATCH', '/api/bag/lines/nope', { body: { quantity: 2 } }), deps(), 'nope')).status).toBe(400);
    // A line of someone else's bag is not found from this bag.
    const theirs = await read(await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: v.id } }), deps()));
    const mine = await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: variant('essential-pique-polo', 'navy', 'S').id } }), deps());
    const other = theirs.body.lineId as string;
    expect((await deleteLineHandler(req('DELETE', `/api/bag/lines/${other}`, { cookie: jar(mine) }), deps(), other)).status).toBe(404);
    expect((await addLineHandler(req('POST', '/api/bag/lines', { body: { variantId: 'not-a-uuid' } }), deps())).status).toBe(400);
  });

  it('the sample-bag fill answers only on a test server (EXTAS_SHOP_TEST_PAGES=1)', async () => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
    expect((await tryFillHandler(req('POST', '/api/bag/try'), deps())).status).toBe(404);
    process.env.EXTAS_SHOP_TEST_PAGES = '1';
    try {
      const r = await read(await tryFillHandler(req('POST', '/api/bag/try'), deps()));
      expect(r.status).toBe(200);
      expect(r.body.filled).toBeGreaterThanOrEqual(2);
      expect(r.body.count as number).toBeGreaterThanOrEqual(3);
    } finally {
      delete process.env.EXTAS_SHOP_TEST_PAGES;
    }
  });

  it('PR 107 / 114 · the pictures by id, and "You may also like" from the same categories, never what is in the bag', async () => {
    const shirt = products['oxford-cotton-shirt']!;
    const cards = await cardsByIds(S, [shirt.id]);
    expect(cards.get(shirt.id)?.slug).toBe('oxford-cotton-shirt');
    const picks = await bagPickCards(S, [shirt.id], 6);
    expect(picks.cards.map((c) => c.id)).not.toContain(shirt.id);
    if (picks.from === 'same') {
      const cat = (await t.prisma.product.findUniqueOrThrow({ where: { id: shirt.id }, select: { category: { select: { slug: true } } } })).category?.slug;
      expect(picks.cards.every((c) => c.categorySlug === cat)).toBe(true);
    }
    expect(picks.cards.length).toBeLessThanOrEqual(6);
    expect(await bagPickCards(S, [], 6)).toEqual({ cards: [], from: 'none' });
  });
});
