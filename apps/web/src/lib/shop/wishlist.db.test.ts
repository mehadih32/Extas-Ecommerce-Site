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
import { mergeWishes, wishDetails, wishlistHandler, wishRows, wishTryHandler, type WishDeps } from './wishlist';

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

  it('PR 610: on v6 a B-grade piece counts 0 until the ERP opens B-grade lines (erp.orders.bGradeOpen), as the bag refuses it', async () => {
    const ids = live.flatMap((p) => p.variants.map((v) => v.id));
    const before = await sellableReader(t.prisma, settings, S)(ids);
    const id = ids.find((x) => (before.get(x) ?? 0) > 0)!;
    expect(id).toBeTruthy();
    await t.prisma.productVariant.update({ where: { id }, data: { grade: 'B' } });
    try {
      expect((await sellableReader(t.prisma, settings, S)([id])).get(id)).toBe(before.get(id)); // v5: nothing changes
      overrides.set('erp.model', 'v6');
      expect((await sellableReader(t.prisma, settings, S)([id])).get(id)).toBe(0);
      overrides.set('erp.orders.bGradeOpen', true);
      expect((await sellableReader(t.prisma, settings, S)([id])).get(id)).toBe(before.get(id));
    } finally {
      overrides.delete('erp.model');
      overrides.delete('erp.orders.bGradeOpen');
      await t.prisma.productVariant.update({ where: { id }, data: { grade: 'A' } });
    }
  });

  it('follow-up 71 · at sign-in the browser`s hearts join the account: once each, up to the limit, nothing dropped', async () => {
    const customer = await t.prisma.customer.create({ data: { storeId: S, phone: '+8801700000071' }, select: { id: true } });
    const signed = (): WishDeps => ({ ...deps(), customerOf: async () => customer.id });
    // the account already holds live[5] (saved on another device, no size) and live[6]
    const other = jar(await wishlistHandler(req('POST', { body: { ids: [live[6]!.id, live[5]!.id] } }), signed()));
    expect(other).toContain('__Host-extas_bag=');
    // this browser, signed out: live[4] and live[5] with a size
    const p5 = live[5]!;
    const cookie = jar(await wishlistHandler(req('POST', { body: { items: [{ productId: live[4]!.id }, { productId: p5.id, variantId: p5.variants[0]?.id }] } }), deps()));
    const visitor = decodeURIComponent(/__Host-extas_bag=([^;]+)/.exec(cookie)![1]!);
    // signed out, this browser sees only its own; the account's other hearts are not here
    expect(new Set((await read(await wishlistHandler(req('GET', { cookie }), deps()))).body.ids)).toEqual(new Set([live[4]!.id, p5.id]));

    expect(await mergeWishes(deps(), visitor, customer.id)).toEqual({ moved: 1, same: 1, kept: 0 });
    const mine = await wishRows(deps(), visitor, customer.id);
    expect(new Set(mine.map((r) => r.productId))).toEqual(new Set([live[4]!.id, live[5]!.id, live[6]!.id]));
    if (p5.variants[0]) expect(mine.find((r) => r.productId === p5.id)?.variantId).toBe(p5.variants[0].id);
    // the browser's copy of the shared product is archived, never deleted
    expect(await t.prisma.wishlistItem.count({ where: { visitorId: visitor, productId: p5.id, archivedAt: { not: null } } })).toBe(1);
    // signed in, the API answers with the account's list; signed out again, this browser holds nothing of it
    expect((await read(await wishlistHandler(req('GET', { cookie }), signed()))).body.ids).toHaveLength(3);
    expect((await read(await wishlistHandler(req('GET', { cookie }), deps()))).body.ids).toEqual([]);

    // a full account: the browser's extra hearts stay on the browser and still show while signed in
    overrides.set('wish.list', { ...registry['wish.list'].default, max: 3 });
    try {
      const more = jar(await wishlistHandler(req('POST', { body: { ids: [live[7]!.id] } }), deps()));
      const v2 = decodeURIComponent(/__Host-extas_bag=([^;]+)/.exec(more)![1]!);
      expect(await mergeWishes(deps(), v2, customer.id)).toEqual({ moved: 0, same: 0, kept: 1 });
      expect(await wishRows(deps(), v2, customer.id)).toHaveLength(4);
    } finally {
      overrides.delete('wish.list');
    }
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
