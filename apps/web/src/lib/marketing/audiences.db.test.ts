// S13 · PR 262 — Marketing › Audiences on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): each condition
// counts the right people from orders, deliveries, checkouts, bags, sizes, refusals (never the shop's fault), VIP (only
// once the owner has his figure) and no-offers; a number stored in either form is one person; gifts and erased customers
// never count; "and" with "leave out"; saved with its count at its version (stale refused, another store's size refused),
// counted again, archived and restored (never deleted), audited; the count card's names masked; signed out 401. Every
// value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { audienceCountHandler, audienceMembers, audiencesHandler, recountAudiences } from './audiences';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const DAY = 86_400_000;
const ph = (n: number) => `+88017110000${String(n).padStart(2, '0')}`;

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.62' };
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

describe.skipIf(!HAS_TEST_DB)('Marketing › Audiences on PostgreSQL (PR 262)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let sizeL = '';
  let otherSize = '';
  let n = 0;
  const S = MOTHER_STORE_ID;
  const ago = (d: number) => new Date(Date.now() - d * DAY);
  const api = async (method: string, id: string | null, body?: unknown, cookie = owner) => {
    const r = await audiencesHandler(call(method, `/api/admin/marketing/audiences${id ? `/${id}` : ''}`, cookie, body), deps, id);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const count = async (definition: unknown, cookie = owner) => {
    const r = await audienceCountHandler(call('GET', `/api/admin/marketing/audiences/count?definition=${encodeURIComponent(JSON.stringify(definition))}`, cookie), deps);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const order = async (phone: string, o: { placed: number; status?: 'PLACED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED'; delivered?: number; gift?: boolean; size?: string; reason?: string; ourFault?: boolean }) => {
    n += 1;
    const row = await t.prisma.order.create({
      data: { storeId: S, number: `W262-${n}`, source: 'WEBSITE', currency: 'BDT', phone, status: o.status ?? 'PLACED', placedAt: ago(o.placed), deliveredAt: o.delivered == null ? null : ago(o.delivered), returnedAt: o.status === 'RETURNED' ? ago(o.placed - 1) : null, isGift: o.gift ?? false, subtotalMinor: 150_000, deliveryChargeMinor: 0, totalMinor: 150_000, paymentMethod: 'COD', idempotencyKey: `w262-${n}` },
    });
    if (o.size) await t.prisma.orderItem.create({ data: { storeId: S, orderId: row.id, sku: `SKU-${n}`, productName: 'Sample polo', quantity: 1, unitPriceMinor: 150_000, lineTotalMinor: 150_000, sizeLabel: o.size } });
    if (o.status === 'RETURNED') await t.prisma.returnRecord.create({ data: { storeId: S, orderId: row.id, kind: 'REFUSED_AT_DOOR', reasonCode: o.reason ?? null, ourFault: o.ourFault ?? false } });
    return row;
  };
  const people = async (rules: unknown[]) => [...(await audienceMembers(deps.db, deps.resolver, { v: 1, rules: rules as never })).phones].sort();

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('audiences');
    const [A, B] = await seedSampleStores(t.prisma);
    expect(A).toBe(S);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    sizeL = (await t.prisma.size.create({ data: { storeId: S, key: 'w262-l', label: 'W262-L' } })).id;
    otherSize = (await t.prisma.size.create({ data: { storeId: B!, key: 'w262-l', label: 'W262-L' } })).id;
    // 1: delivered 3 days ago in size L, said no to offers; 2: ordered 10 days ago and refused a parcel (not our fault);
    // 3: ordered 2 days ago, stored in the local form; 4: left a checkout yesterday; 5: refused, the shop's fault;
    // 6: only a gift sent to him; 7: ordered 100 days ago; 8: a bag never bought; 9: ordered, then erased.
    await t.prisma.customer.create({ data: { storeId: S, phone: ph(1), name: 'Sample One', smsMarketingConsent: false } });
    await order(ph(1), { placed: 5, status: 'DELIVERED', delivered: 3, size: 'W262-L' });
    await order(ph(2), { placed: 10 });
    await order(ph(2), { placed: 20, status: 'RETURNED', reason: 'changed-mind' });
    await order('01711000003', { placed: 2 });
    await t.prisma.checkoutDraft.create({ data: { storeId: S, visitorId: 'w262-v4', phone: ph(4), lastActivityAt: ago(1) } });
    await t.prisma.checkoutDraft.create({ data: { storeId: S, visitorId: 'w262-v3', phone: ph(3), lastActivityAt: ago(1), convertedOrderId: (await t.prisma.order.findFirstOrThrow({ where: { number: 'W262-4' } })).id } });
    await order(ph(5), { placed: 15, status: 'RETURNED', reason: 'late' });
    await order(ph(6), { placed: 1, gift: true });
    await order(ph(7), { placed: 100 });
    const h = await t.prisma.customer.create({ data: { storeId: S, phone: ph(8), name: 'Sample Eight' } });
    const cart = await t.prisma.cart.create({ data: { storeId: S, customerId: h.id, visitorId: 'w262-v8', lastActivityAt: ago(1) } });
    await t.prisma.cartItem.create({ data: { storeId: S, cartId: cart.id, variantId: '0192f000-0000-7000-8000-000000000262', quantity: 1, unitPriceMinor: 150_000 } });
    await order(ph(9), { placed: 1 });
    await t.prisma.customer.create({ data: { storeId: S, phone: ph(9), erasedAt: new Date() } });
  });
  afterAll(async () => t?.drop());

  it('counts each condition from what people really did; one person per number however it was stored', async () => {
    expect(await people([{ kind: 'ordered', days: 30 }])).toEqual([ph(1), ph(2), ph(3), ph(5)]);
    expect(await people([{ kind: 'delivered', days: 7 }])).toEqual([ph(1)]);
    expect(await people([{ kind: 'incomplete', days: 7 }])).toEqual([ph(4)]);
    expect(await people([{ kind: 'bagNoBuy', days: 7 }])).toEqual([ph(8)]);
    expect(await people([{ kind: 'size', ref: sizeL }])).toEqual([ph(1)]);
    expect(await people([{ kind: 'refused' }])).toEqual([ph(2)]);
    expect(await people([{ kind: 'refused', days: 5 }])).toEqual([]);
    expect(await people([{ kind: 'ordered', days: 365 }, { kind: 'refused', exclude: true }, { kind: 'noOffers', exclude: true }])).toEqual([ph(3), ph(5), ph(7)]);
  });

  it('counts VIP only once the owner has his figure, by Sales (delivered) like Customers › VIP', async () => {
    const before = await audienceMembers(deps.db, deps.resolver, { v: 1, rules: [{ kind: 'vip', days: null, ref: null, exclude: false }] });
    expect([before.phones.size, before.unavailable]).toEqual([0, ['vip']]);
    await deps.resolver.set('customers.list', { ...(await deps.resolver.value('customers.list', { storeId: S })), vipMinSalesMinor: 100_000 }, storeTarget(S));
    expect(await people([{ kind: 'vip' }])).toEqual([ph(1)]);
  });

  it('saves an audience with its count at its version, counts again, archives and restores, and is audited', async () => {
    const def = { rules: [{ kind: 'ordered', days: 30 }, { kind: 'refused', exclude: true }] };
    const made = await api('POST', null, { name: 'Recent buyers, no refusals', definition: def });
    expect(made.status).toBe(201);
    const a = made.j.audience;
    expect([a.size, a.kind, a.state, a.campaigns]).toEqual([3, 'BUILDER', 'ACTIVE', 0]);
    expect((await api('PUT', a.id, { name: 'Renamed', definition: def, version: 'old' })).j.error).toBe('STALE');
    expect((await api('POST', null, { name: 'Other store size', definition: { rules: [{ kind: 'size', ref: otherSize }] } })).status).toBe(400);
    expect((await api('POST', null, { name: 'No days', definition: { rules: [{ kind: 'ordered' }] } })).j.details).toContain('definition.rules.days');
    await order(ph(10), { placed: 1 });
    const again = await api('POST', a.id, { action: 'recount', version: a.version });
    expect(again.j.audience.size).toBe(4);
    const arch = await api('POST', a.id, { action: 'archive', version: again.j.audience.version });
    expect(arch.j.audience.state).toBe('ARCHIVED');
    expect((await api('POST', a.id, { action: 'recount', version: arch.j.audience.version })).j.error).toBe('WRONG_STATE');
    expect((await api('PUT', a.id, { name: 'x', definition: def, version: arch.j.audience.version })).j.error).toBe('ARCHIVED');
    const back = await api('POST', a.id, { action: 'restore', version: arch.j.audience.version });
    expect(back.j.audience.state).toBe('ACTIVE');
    expect(await t.prisma.audience.count({ where: { id: a.id } })).toBe(1);
    await t.prisma.campaign.create({ data: { storeId: S, name: 'Uses it', status: 'DRAFT', audienceId: a.id } });
    expect((await api('GET', null)).j.list.find((x: { id: string }) => x.id === a.id).campaigns).toBe(1);
    const actions = (await t.prisma.auditLog.findMany({ where: { entityId: a.id }, select: { action: true } })).map((x) => x.action).sort();
    expect(actions).toEqual(['marketing.audience.archive', 'marketing.audience.create', 'marketing.audience.recount', 'marketing.audience.restore']);
    expect(await recountAudiences(deps.db, deps.resolver)).toBe(1);
  });

  it('shows the count with a few masked names, saves nothing, and refuses a stranger', async () => {
    const c = await count({ rules: [{ kind: 'delivered', days: 7 }] });
    expect(c.status).toBe(200);
    expect(c.j.count.size).toBe(1);
    expect(c.j.count.sample[0].name).toBe('Sample One');
    expect(c.j.count.sample[0].phone).toContain('•');
    expect(c.j.count.sample[0].phone).not.toContain('11000001');
    expect((await count({ rules: [] })).status).toBe(400);
    expect((await count({ rules: [{ kind: 'vip' }] }, '')).status).toBe(401);
    expect((await api('GET', null, undefined, '')).status).toBe(401);
  });
});
