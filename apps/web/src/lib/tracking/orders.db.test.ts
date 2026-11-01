// S13 · PR 258 — delivered-purchase optimisation on a real PostgreSQL: off as it ships (nothing read); switched on by
// someone with `ads.tracking.manage` (version-checked, audited); a confirmed and a delivered order become one event
// each (never twice, however often the reader runs), valued at the pieces kept (a partial delivery: only the kept
// lines), carrying the purchase event's browser facts; only the ticked sources and the look-back; while a purchase
// means the delivery, the delivered parcel goes under the platforms' purchase name and the order placed as "order
// placed"; a guest order with nothing to match it to is left out; "Send waiting now" reads the timeline first. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
// Sample values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockAdOutbox } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { trackingHandler, type TrackingOverview } from './admin';
import { orderTrackingTick, recordOrderSteps } from './orders';
import type { TrackingDeps } from './service';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const UA = 'SampleBrowser/1.0';

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(path: string, method: string, o: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': UA, 'x-forwarded-for': '192.0.2.41', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('delivered-purchase optimisation on PostgreSQL (PR 258)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let deps: TrackingDeps;
  let owner = '';
  let n = 0;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  const api = async (method: string, b?: unknown) => {
    const res = await trackingHandler(req('/api/admin/marketing/tracking', method, { body: b, cookie: owner }), admin, `https://${HOST}`, { defer: undefined });
    return { status: res.status, a: (await res.json()) as { ok: boolean; error?: string; overview: TrackingOverview; cards: Record<string, unknown>; outcome?: { steps?: { recorded: number } } } };
  };

  /** An order with two lines (one 1,200 taka polo ×2, one 900 taka tee), its timeline steps, at the hours given. */
  async function order(o: { source?: 'WEBSITE' | 'SHOWROOM'; steps: { to: 'CONFIRMED' | 'DELIVERED' | 'PARTIALLY_DELIVERED'; hoursAgo: number; keepTee?: boolean }[]; gift?: boolean; guest?: boolean }) {
    const number = `D258-${++n}`;
    const customerId = o.guest ? null : (await t.prisma.customer.create({ data: { storeId: S, name: `Sample buyer ${n}`, phone: `+88017110000${String(n).padStart(2, '0')}` }, select: { id: true } })).id; // hardcode-ok: made-up test numbers
    const made = await t.prisma.order.create({
      data: { storeId: S, number, source: o.source ?? 'WEBSITE', currency: 'BDT', subtotalMinor: 330_000, deliveryChargeMinor: 12_000, totalMinor: 342_000, idempotencyKey: `d258-${n}`, customerId, phone: '+8801711000000', email: 'sample@example.com', isGift: o.gift ?? false },
    });
    const polo = await t.prisma.orderItem.create({ data: { storeId: S, orderId: made.id, sku: 'D258-POLO-M', productName: 'Sample polo', colourName: 'Navy', sizeLabel: 'M', quantity: 2, unitPriceMinor: 120_000, lineTotalMinor: 240_000 } });
    const tee = await t.prisma.orderItem.create({ data: { storeId: S, orderId: made.id, sku: 'D258-TEE-L', productName: 'Sample tee', colourName: 'White', sizeLabel: 'L', quantity: 1, unitPriceMinor: 90_000, lineTotalMinor: 90_000 } });
    for (const st of o.steps)
      await t.prisma.orderEvent.create({
        data: { storeId: S, orderId: made.id, type: 'order.status', toStatus: st.to, actorType: 'SYSTEM', source: 'test', createdAt: hoursAgo(st.hoursAgo), ...(st.to === 'PARTIALLY_DELIVERED' ? { data: { keptItemIds: [st.keepTee ? tee.id : polo.id] } } : {}) },
      });
    return { id: made.id, number, polo: polo.id, tee: tee.id };
  }
  const step = (eventId: string) => t.prisma.trackedEvent.findFirst({ where: { storeId: S, eventId } });
  const setDp = async (patch: Record<string, unknown>) => {
    const v = await deps.resolver.value('ads.deliveredPurchase', { storeId: S });
    await deps.resolver.set('ads.deliveredPurchase', { ...v, ...patch }, storeTarget(S), { actorId: null, reason: 'test' });
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    deps = { db: t.prisma, resolver, vault: null };
    owner = cookiesOf(await loginHandler(req('/api/admin/auth/login', 'POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('is off as it ships: nothing is read, and the clock passes it by', async () => {
    await order({ steps: [{ to: 'CONFIRMED', hoursAgo: 2 }] });
    expect(await recordOrderSteps(deps, S)).toMatchObject({ recorded: 0, skipped: 'off' });
    expect(await orderTrackingTick(deps, new Map())).toBe(0);
    const { a } = await api('GET');
    expect(a.overview.delivered.value).toMatchObject({ on: false, purchaseMeans: 'placed' });
    expect(a.cards).toHaveProperty('delivered');
    expect(await t.prisma.trackedEvent.count()).toBe(0);
  });

  it('the card is version-checked, refuses a wrong value and is audited', async () => {
    const card = (await api('GET')).a.overview.delivered;
    expect((await api('PUT', { key: 'delivered', value: { ...card.value, on: true }, version: 'old' })).a.error).toBe('STALE');
    expect((await api('PUT', { key: 'delivered', value: { ...card.value, purchaseMeans: 'paid' }, version: card.version })).a.error).toBe('INVALID_INPUT');
    const saved = await api('PUT', { key: 'delivered', value: { ...card.value, on: true }, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.a.overview.delivered.value.on).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.tracking.delivered' } })).toBe(1);
    // delivered sales ride on tracking: still nothing while tracking is off
    expect(await recordOrderSteps(deps, S)).toMatchObject({ skipped: 'off' });
    const tr = (await api('GET')).a.overview.card;
    expect((await api('PUT', { key: 'tracking', value: { ...tr.value, on: true, platforms: { meta: true, google: true, tiktok: false } }, version: tr.version })).status).toBe(200);
  });

  it('a confirmed and a delivered order: one event each, never twice, valued at the pieces kept, with the purchase’s browser facts', async () => {
    mockAdOutbox.clear();
    const o = await order({ steps: [{ to: 'CONFIRMED', hoursAgo: 30 }, { to: 'DELIVERED', hoursAgo: 1 }] });
    await t.prisma.trackedEvent.create({ data: { storeId: S, eventId: `purchase-${o.number}`, name: 'purchase', url: `https://${HOST}/checkout`, valueMinor: 342_000, currency: 'BDT', orderId: o.id, userData: { ext: 'c'.repeat(64), ua: UA, fbc: 'fb.1.1700000000000.AbC' }, deliveries: {}, pending: false, occurredAt: hoursAgo(31) } });
    const run = await recordOrderSteps(deps, S);
    expect(run.recorded).toBe(3); // the first sample order's confirmation too
    const confirmed = await step(`confirmed-${o.number}`);
    const delivered = await step(`delivered-${o.number}`);
    expect(confirmed).toMatchObject({ name: 'confirmed', valueMinor: 330_000, orderId: o.id });
    expect(delivered).toMatchObject({ name: 'delivered', valueMinor: 330_000, currency: 'BDT', url: `https://${HOST}/checkout`, pending: false });
    expect(delivered!.occurredAt.getTime()).toBeLessThan(Date.now() - 3_000_000);
    expect(delivered!.items).toEqual([expect.objectContaining({ sku: 'D258-POLO-M', colour: 'Navy', size: 'M', quantity: 2, priceMinor: 120_000 }), expect.objectContaining({ sku: 'D258-TEE-L', quantity: 1 })]);
    expect(delivered!.userData).toMatchObject({ ua: UA, fbc: 'fb.1.1700000000000.AbC' });
    expect(delivered!.userData).not.toHaveProperty('em'); // matching is off
    expect(delivered!.deliveries).toMatchObject({ meta: { state: 'mock' }, google: { state: 'mock' } });
    // as built, a purchase is still the order placed: the delivery goes as its own event
    const meta = mockAdOutbox.all().find((m) => m.platform === 'meta')!;
    const names = (meta.payload as { data: { event_id: string; event_name: string; action_source: string }[] }).data;
    expect(names.find((d) => d.event_id === `delivered-${o.number}`)).toMatchObject({ event_name: 'OrderDelivered', action_source: 'website' });
    // the first sample order has no purchase event: the step goes as the order's own
    expect(names.find((d) => d.event_id === 'confirmed-D258-1')).toMatchObject({ action_source: 'system_generated' });
    // again, and from the clock: nothing new
    expect((await recordOrderSteps(deps, S)).recorded).toBe(0);
    expect(await t.prisma.trackedEvent.count({ where: { eventId: { startsWith: 'delivered-' } } })).toBe(1);
  });

  it('a partial delivery counts only the kept lines; other sources, old steps and unticked steps are left out', async () => {
    const part = await order({ steps: [{ to: 'PARTIALLY_DELIVERED', hoursAgo: 1, keepTee: true }] });
    const shop = await order({ source: 'SHOWROOM', steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    const old = await order({ steps: [{ to: 'DELIVERED', hoursAgo: 49 }] });
    const unticked = await order({ steps: [{ to: 'CONFIRMED', hoursAgo: 1 }] });
    await setDp({ events: { confirmed: false, delivered: true } });
    await recordOrderSteps(deps, S);
    expect(await step(`delivered-${part.number}`)).toMatchObject({ valueMinor: 90_000 });
    expect((await step(`delivered-${part.number}`))!.items).toEqual([expect.objectContaining({ sku: 'D258-TEE-L' })]);
    expect(await step(`delivered-${shop.number}`)).toBeNull();
    expect(await step(`delivered-${old.number}`)).toBeNull();
    expect(await step(`confirmed-${unticked.number}`)).toBeNull();
    // the owner widens the look-back and ticks the showroom: they come in once
    await setDp({ lookbackHours: 72, sources: { ...(await deps.resolver.value('ads.deliveredPurchase', { storeId: S })).sources, SHOWROOM: true } });
    expect((await recordOrderSteps(deps, S)).recorded).toBe(2);
  });

  it('a guest order with nothing to match it to is left out, never sent empty', async () => {
    const guest = await order({ guest: true, steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    const run = await recordOrderSteps(deps, S);
    expect(run).toMatchObject({ recorded: 0, unmatched: 1 });
    expect(await step(`delivered-${guest.number}`)).toBeNull();
  });

  it('matching on: the order’s contact as hashes, a gift’s never', async () => {
    const v = await deps.resolver.value('ads.tracking', { storeId: S });
    await deps.resolver.set('ads.tracking', { ...v, matchCustomers: true }, storeTarget(S), { actorId: null, reason: 'test' });
    const mine = await order({ steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    const gift = await order({ gift: true, steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    await recordOrderSteps(deps, S);
    expect((await step(`delivered-${mine.number}`))!.userData).toMatchObject({ em: expect.stringMatching(/^[0-9a-f]{64}$/), phPlus: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect((await step(`delivered-${gift.number}`))!.userData).not.toHaveProperty('em');
    expect(JSON.stringify((await step(`delivered-${mine.number}`))!.userData)).not.toMatch(/8801711000000|sample@example/);
  });

  it('a purchase meaning the delivery: the parcel goes as the platforms’ purchase, the order placed as “order placed”', async () => {
    await setDp({ purchaseMeans: 'delivered' });
    mockAdOutbox.clear();
    const o = await order({ steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    await t.prisma.trackedEvent.create({ data: { storeId: S, eventId: `purchase-${o.number}`, name: 'purchase', valueMinor: 342_000, currency: 'BDT', orderId: o.id, userData: { ua: UA }, deliveries: { meta: { state: 'waiting', attempts: 0 } }, pending: true, occurredAt: hoursAgo(20) } });
    const { status, a } = await api('POST', { action: 'send' });
    expect(status).toBe(200);
    expect(a.outcome!.steps!.recorded).toBe(1);
    const sent = mockAdOutbox
      .all()
      .filter((m) => m.platform === 'meta')
      .flatMap((m) => (m.payload as { data: { event_id: string; event_name: string; custom_data: { value?: number; order_id?: string } }[] }).data);
    expect(sent.find((d) => d.event_id === `delivered-${o.number}`)).toMatchObject({ event_name: 'Purchase', custom_data: { value: 3300, order_id: o.number } });
    expect(sent.find((d) => d.event_id === `purchase-${o.number}`)).toMatchObject({ event_name: 'OrderPlaced' });
    expect(a.overview.recorded).toMatchObject({ delivered: expect.any(Number), confirmed: expect.any(Number) });
    expect(a.overview.table.delivered!.meta!.mock).toBeGreaterThan(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.tracking.send' } })).toBe(1);
  });

  it('the clock runs a store only when it is due by the owner’s minutes', async () => {
    const last = new Map<number, number>();
    const now = Date.now();
    expect(await orderTrackingTick(deps, last, now)).toBe(1);
    expect(await orderTrackingTick(deps, last, now + 60_000)).toBe(0);
    expect(await orderTrackingTick(deps, last, now + 10 * 60_000)).toBe(1);
  });
});
