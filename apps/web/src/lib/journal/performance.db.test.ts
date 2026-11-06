// S12 · PR 250 — the content performance report on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): nothing
// counted while `blog.performance.count` is off; a live article counted once a shop day per browser by where the reader
// came from (a draft never); the beacon refuses another site and a bad id; an order credits the last article read in the
// window (or every one), once; the report's Ordered value beside Sales (delivered only) through @extas/metrics; money
// hidden without `reports.read`; the card saved with its version (stale refused); signed out 401. Made-up values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { creditOrder, performanceHandler, performanceReport, readHandler, recordRead, withoutMoney } from './performance';
import { READ_COOKIE } from './performance-model';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { cookie?: string; body?: unknown; site?: 'cross-site' } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.64' };
  if (method !== 'GET') headers.origin = opts.site ? 'https://elsewhere.example' : `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');
const readValue = (setCookie: string | null) => decodeURIComponent((setCookie ?? '').split(';')[0]!.slice(READ_COOKIE.length + 1));

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Performance on PostgreSQL (PR 250)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-06T06:00:00Z') }; // 12:00 in Dhaka
  const ids: Record<string, string> = {};
  let n = 0;
  const on = async (patch: Record<string, unknown>) => {
    const v = await deps.resolver.value('blog.performance', { storeId: S });
    await deps.resolver.set('blog.performance', { ...v, ...patch } as never, storeTarget(S), { actorId: null, reason: 'test' });
  };
  const read = (postId: string, from: unknown, cookie: string | null = null) => recordRead(t.prisma, deps.resolver, { storeId: S, postId, from, cookie, now: clock.now });
  const order = async (total: number) => {
    n += 1;
    return (
      await t.prisma.order.create({
        data: { storeId: S, number: `T250-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'PLACED', placedAt: clock.now, subtotalMinor: total, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: total, paymentMethod: 'COD', idempotencyKey: `t250-${n}` },
      })
    ).id;
  };
  const stat = (postId: string) => t.prisma.blogPostDailyStat.findMany({ where: { postId }, orderBy: { day: 'asc' }, select: { readers: true, fromSearch: true, fromShop: true, fromOther: true } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('performance');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const mk = async (slug: string, status: 'PUBLISHED' | 'DRAFT', locale = 'en') =>
      (await t.prisma.blogPost.create({ data: { storeId: S, locale, slug, title: `Sample ${slug}`, body: 'Sample words.', status, publishedAt: status === 'PUBLISHED' ? new Date('2026-11-01T00:00:00Z') : null } })).id;
    ids.wash = await mk('how-to-wash', 'PUBLISHED');
    ids.linen = await mk('linen-summer', 'PUBLISHED');
    ids.bn = await mk('polo-dhowa', 'PUBLISHED', 'bn');
    ids.draft = await mk('draft-one', 'DRAFT');
  });
  afterAll(async () => t?.drop());

  it('as shipped nothing is counted and no cookie is set', async () => {
    expect((await deps.resolver.value('blog.performance', { storeId: S })).count).toBe(false);
    expect(await read(ids.wash!, 'https://www.google.com')).toBeNull();
    expect(await stat(ids.wash!)).toEqual([]);
  });

  it('on: a live article counted once a shop day per browser, by where the reader came from; a draft never', async () => {
    await on({ count: true });
    const c1 = await read(ids.wash!, 'https://www.google.com');
    expect(c1).toContain(`${READ_COOKIE}=`);
    expect(c1).toContain('HttpOnly');
    const again = await read(ids.wash!, 'https://www.google.com', readValue(c1));
    expect(again).not.toBeNull();
    await read(ids.wash!, 'shop');
    await read(ids.wash!, 'https://l.facebook.com');
    expect(await stat(ids.wash!)).toEqual([{ readers: 3, fromSearch: 1, fromShop: 1, fromOther: 1 }]);
    clock.now = new Date('2026-11-06T18:30:00Z'); // 00:30 the next day in Dhaka
    await read(ids.wash!, 'https://www.google.com', readValue(again));
    expect((await stat(ids.wash!)).map((r) => r.readers)).toEqual([3, 1]);
    clock.now = new Date('2026-11-06T06:00:00Z');
    expect(await read(ids.draft!, 'shop')).toBeNull();
    expect(await stat(ids.draft!)).toEqual([]);
  });

  it('the beacon: another site 403, a bad id 400, a read 204 with the cookie', async () => {
    const shop = { db: t.prisma, settings: deps.resolver, storeId: S, now: () => clock.now };
    expect((await readHandler(call('POST', '/api/shop/journal-read', { body: { postId: ids.linen, from: 'shop' }, site: 'cross-site' }), shop)).status).toBe(403);
    expect((await readHandler(call('POST', '/api/shop/journal-read', { body: { postId: 'nope' } }), shop)).status).toBe(400);
    const ok = await readHandler(call('POST', '/api/shop/journal-read', { body: { postId: ids.linen, from: 'https://chatgpt.com' } }), shop);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('set-cookie')).toContain(READ_COOKIE);
    expect(await stat(ids.linen!)).toEqual([{ readers: 1, fromSearch: 1, fromShop: 0, fromOther: 0 }]);
  });

  it('an order credits the last article read in the window, once; `every` credits each; off credits none', async () => {
    const at = clock.now.getTime();
    const cookie = `${ids.linen}.${Math.floor((at - 9 * 86_400_000) / 1000)}_${ids.wash}.${Math.floor((at - 2 * 86_400_000) / 1000)}_${ids.bn}.${Math.floor((at - 3_600_000) / 1000)}`;
    const o1 = await order(200_000);
    expect(await creditOrder(t.prisma, deps.resolver, { storeId: S, orderId: o1, cookie })).toBe(1);
    expect(await creditOrder(t.prisma, deps.resolver, { storeId: S, orderId: o1, cookie })).toBe(0);
    expect((await t.prisma.blogOrderRead.findMany({ where: { orderId: o1 } })).map((r) => r.postId)).toEqual([ids.bn]);
    await on({ credit: 'every' });
    const o2 = await order(100_000);
    expect(await creditOrder(t.prisma, deps.resolver, { storeId: S, orderId: o2, cookie })).toBe(2);
    await on({ count: false });
    expect(await creditOrder(t.prisma, deps.resolver, { storeId: S, orderId: await order(50_000), cookie })).toBe(0);
    await on({ count: true, credit: 'last' });
    ids.o1 = o1;
  });

  it('the report: Ordered value beside Sales (delivered only); the total counts each order once', async () => {
    let r = await performanceReport(t.prisma, deps.resolver, clock.now, { days: 7 });
    const bn = r.rows.find((x) => x.id === ids.bn)!;
    expect(bn.ordered).toEqual({ orders: 2, valueMinor: 300_000 });
    expect(bn.sales).toEqual({ orders: 0, valueMinor: 0 });
    expect(r.rows.find((x) => x.id === ids.wash)).toMatchObject({ readers: 3, ordered: { orders: 1, valueMinor: 100_000 } });
    expect(r.rows.some((x) => x.id === ids.draft)).toBe(false);
    expect(r.fromArticles.ordered).toMatchObject({ orders: 2, valueMinor: 300_000 });
    expect(r.shop.ordered.orders).toBe(3);
    expect(r.totals.readers).toBe(4); // the next day's reader of the wash article is after this period
    await t.prisma.order.update({ where: { id: ids.o1! }, data: { status: 'DELIVERED', deliveredAt: clock.now } });
    r = await performanceReport(t.prisma, deps.resolver, clock.now, { days: 7 });
    expect(r.fromArticles.sales).toMatchObject({ orders: 1, valueMinor: 200_000 });
    expect(r.rows[0]!.id).toBe(ids.bn);
    const hidden = withoutMoney(r);
    expect(hidden.fromArticles.sales).toMatchObject({ orders: 1, valueMinor: 0 });
    expect(hidden.rows[0]!.ordered.valueMinor).toBe(0);
  });

  it('the API: the owner reads it, the card saves with its version (stale refused), signed out 401', async () => {
    const g = await performanceHandler(call('GET', '/api/admin/blog/performance?days=30', { cookie: owner }), deps);
    expect(g.status).toBe(200);
    const j = (await g.json()) as { report: { days: number; card: { value: Record<string, unknown>; version: string } } };
    expect(j.report.days).toBe(30);
    const card = j.report.card;
    const put = (version: string, value: unknown) => performanceHandler(call('PUT', '/api/admin/blog/performance', { cookie: owner, body: { key: 'blog.performance', version, value } }), deps);
    expect((await put('stale', { ...card.value, windowDays: 3 })).status).toBe(409);
    expect((await put(card.version, { ...card.value, windowDays: 0 })).status).toBe(400);
    expect((await put(card.version, { ...card.value, windowDays: 3 })).status).toBe(200);
    expect((await deps.resolver.value('blog.performance', { storeId: S })).windowDays).toBe(3);
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.performance.settings' } })).toBe(1);
    expect((await performanceHandler(call('GET', '/api/admin/blog/performance'), deps)).status).toBe(401);
  });
});
