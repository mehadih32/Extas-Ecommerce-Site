// PR 71 — the wishlist API on a real PostgreSQL (a throwaway database with the sample catalogue; skipped without
// TEST_DATABASE_ADMIN_URL), called the way the browser calls it: the visitor cookie made on the first heart and sent
// back after, both cookies refreshed, same site only, published products only, the list's limit, archive on remove
// (never a deletion), and what the list page reads of a saved size.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma } from '@extas/db/client';
import { seedSample } from '@extas/seed';
import { registry, type Key, type Value } from '@extas/settings';
import { BAG_COOKIE } from './bag-model';
import { sellableReader } from './sellable';
import { WISH_COUNT_COOKIE } from './wish-model';
import { wishDetails, wishlistHandler, wishRows, wishTryHandler, type WishDeps } from './wishlist';

const ORIGIN = 'https://shop.example.test';

describe.skipIf(!HAS_TEST_DB)('the wishlist API on PostgreSQL (PR 71)', () => {
  let t: TestDatabase;
  let S = 0;
  const overrides = new Map<string, unknown>();
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): WishDeps => ({ db: t.prisma, settings, storeId: S });
  let live: { id: string; variants: { id: string }[] }[] = [];
  let draftId = '';

  const req = (method: string, o: { body?: unknown; cookie?: string; site?: string } = {}) =>
    new Request(`${ORIGIN}/api/wishlist`, {
      method,
      headers: { 'sec-fetch-site': o.site ?? 'same-origin', ...(o.cookie ? { cookie: o.cookie } : {}), ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
    });
  const jar = (r: Response) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as { ok: boolean; ids?: string[]; added?: string[]; full?: boolean; error?: string } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('wishlist_api');
    S = (await seedSample(t.prisma)).storeId;
    await disconnectPrisma();
    live = await t.prisma.product.findMany({
      where: { storeId: S, status: 'PUBLISHED', archivedAt: null },
      orderBy: { nameEn: 'asc' },
      select: { id: true, variants: { where: { archivedAt: null, active: true, inStock: true }, select: { id: true }, take: 1 } },
    });
    const draft = await t.prisma.product.findFirst({ where: { storeId: S, status: { not: 'PUBLISHED' } }, select: { id: true } });
    draftId = draft?.id ?? '0199a3b2-1111-7000-8000-00000000dead';
  }, 180_000);

  afterAll(async () => {
    await disconnectPrisma();
    await t?.drop();
  });

  it('the first heart makes the visitor id; both cookies come back; the visitor id is HttpOnly, the count is readable', async () => {
    const r = await wishlistHandler(req('POST', { body: { ids: [live[0]!.id] } }), deps());
    const cookies = r.headers.getSetCookie();
    const { status, body } = await read(r);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, ids: [live[0]!.id], added: [live[0]!.id], full: false });
    expect(cookies.find((c) => c.startsWith(`${BAG_COOKIE}=`))).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    const count = cookies.find((c) => c.startsWith(`${WISH_COUNT_COOKIE}=`))!;
    expect(count).toMatch(/^extas_wish_n=1;/);
    expect(count).not.toContain('HttpOnly');
  });

  it('the browser`s old list is handed over once: each product once, newest first, drafts and strangers ignored', async () => {
    const first = await wishlistHandler(req('POST', { body: { ids: [live[0]!.id] } }), deps());
    const cookie = jar(first);
    const r = await read(await wishlistHandler(req('POST', { cookie, body: { ids: [live[1]!.id, live[0]!.id, draftId, 'not-an-id', live[2]!.id] } }), deps()));
    expect(r.body.added).toEqual([live[1]!.id, live[2]!.id]);
    expect(new Set(r.body.ids)).toEqual(new Set([live[0]!.id, live[1]!.id, live[2]!.id]));
    expect(r.body.ids).not.toContain(draftId);
    const again = await read(await wishlistHandler(req('GET', { cookie }), deps()));
    expect(again.body.ids).toHaveLength(3);
  });

  it('Remove archives the row (never a deletion); a heart again makes a new one', async () => {
    const cookie = jar(await wishlistHandler(req('POST', { body: { ids: [live[3]!.id] } }), deps()));
    const visitor = /__Host-extas_bag=([^;]+)/.exec(cookie)![1]!;
    const gone = await read(await wishlistHandler(req('DELETE', { cookie, body: { productId: live[3]!.id } }), deps()));
    expect(gone.body.ids).toEqual([]);
    const rows = await t.prisma.wishlistItem.findMany({ where: { storeId: S, visitorId: decodeURIComponent(visitor) } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.archivedAt).not.toBeNull();
    await wishlistHandler(req('POST', { cookie, body: { ids: [live[3]!.id] } }), deps());
    expect(await t.prisma.wishlistItem.count({ where: { storeId: S, visitorId: decodeURIComponent(visitor) } })).toBe(2);
  });

  it('past `wish.list.max` a heart is refused with `full`, and nothing already saved is dropped', async () => {
    overrides.set('wish.list', { ...registry['wish.list'].default, max: 10 });
    try {
      const many = live.slice(0, 11).map((p) => p.id);
      expect(many.length).toBe(11);
      const r = await read(await wishlistHandler(req('POST', { body: { ids: many } }), deps()));
      expect(r.body.ids).toHaveLength(10);
      expect(r.body.full).toBe(true);
    } finally {
      overrides.delete('wish.list');
    }
  });

  it('same site only, small bodies only, no list without a visitor id, no strange methods', async () => {
    expect((await wishlistHandler(req('POST', { site: 'cross-site', body: { ids: [live[0]!.id] } }), deps())).status).toBe(403);
    expect((await read(await wishlistHandler(req('GET'), deps()))).body).toEqual({ ok: true, ids: [] });
    expect((await wishlistHandler(req('POST', { body: { ids: ['x'] } }), deps())).status).toBe(400);
    expect((await wishlistHandler(req('DELETE', { body: { productId: 'x' } }), deps())).status).toBe(400);
    expect((await wishlistHandler(req('PUT', { body: {} }), deps())).status).toBe(405);
    expect((await wishlistHandler(req('GET'), null)).status).toBe(503);
  });

  it('from the bag: the size it had is kept, and the list page knows whether that size can be sold now', async () => {
    const p = live.find((x) => x.variants.length)!;
    const variantId = p.variants[0]!.id;
    const cookie = jar(await wishlistHandler(req('POST', { body: { items: [{ productId: p.id, variantId }] } }), deps()));
    const visitor = decodeURIComponent(/__Host-extas_bag=([^;]+)/.exec(cookie)![1]!);
    const rows = await wishRows(deps(), visitor);
    expect(rows[0]).toMatchObject({ productId: p.id, variantId });
    const d = (await wishDetails(deps(), rows)).get(p.id)!;
    const units = (await sellableReader(t.prisma, settings, S)([variantId])).get(variantId)!;
    expect(d.size).toMatchObject({ variantId, sellable: units });
    expect(d.colourKey).toBe(d.size!.colourKey);
    // a variant of another product is never taken as this one's size: the size it was saved with stays
    const other = live.find((x) => x.id !== p.id && x.variants.length)!;
    await wishlistHandler(req('POST', { cookie, body: { items: [{ productId: p.id, variantId: other.variants[0]!.id }] } }), deps());
    expect(await wishRows(deps(), visitor)).toEqual([expect.objectContaining({ productId: p.id, variantId })]);
  });

  it('the test servers` sample hearts: three products, one with a size that can be sold; never on the live shop', async () => {
    const was = process.env.EXTAS_SHOP_TEST_PAGES;
    try {
      delete process.env.EXTAS_SHOP_TEST_PAGES;
      expect((await wishTryHandler(req('POST'), deps())).status).toBe(404);
      process.env.EXTAS_SHOP_TEST_PAGES = '1';
      const r = await wishTryHandler(req('POST'), deps());
      const { body } = await read(r);
      expect(body.ids).toHaveLength(3);
      const visitor = decodeURIComponent(/__Host-extas_bag=([^;]+)/.exec(jar(r))![1]!);
      const details = await wishDetails(deps(), await wishRows(deps(), visitor));
      expect([...details.values()].filter((x) => x.size && x.size.sellable > 0)).toHaveLength(1);
    } finally {
      if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
      else process.env.EXTAS_SHOP_TEST_PAGES = was;
    }
  });
});
