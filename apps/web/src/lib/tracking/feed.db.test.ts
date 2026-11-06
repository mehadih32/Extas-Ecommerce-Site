// S13 · PR 532 — the deep conversion feed on a real PostgreSQL: off as it ships (nothing read, order events go plain);
// the card is version-checked, refused when wrong and audited; switched on (riding on tracking and delivered sales),
// an order handed to the courier and one that came back become one event each, never twice; the qualified sale
// (§59.2) waits the owner's hours with the courier, counts a delivery at once, is held back when cancelled, flagged
// bad or on the blocklist, and goes only to the generous platform, as its purchase (the order placed then as "order
// placed" there, the other platform unchanged); every order event carries the courier outcome and the visitor's intent
// (seen products, bag adds, checkouts, a returning customer), never the phone or e-mail; "Send waiting now" reads the
// feed too. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values.
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
import { recordFeedSteps } from './feed';
import { hashId } from './model';
import { sendEvents, type TrackingDeps } from './service';

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

type Sent = { event_id: string; event_name: string; custom_data: Record<string, unknown>; user_data: Record<string, unknown> };

describe.skipIf(!HAS_TEST_DB)('the deep conversion feed on PostgreSQL (PR 532)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let deps: TrackingDeps;
  let owner = '';
  let n = 0;
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  const api = async (method: string, b?: unknown) => {
    const res = await trackingHandler(req('/api/admin/marketing/tracking', method, { body: b, cookie: owner }), admin, `https://${HOST}`, { defer: undefined });
    return { status: res.status, a: (await res.json()) as { ok: boolean; error?: string; overview: TrackingOverview; cards: Record<string, unknown>; outcome?: { feed?: { recorded: number } } } };
  };

  type To = 'HANDED_OVER' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'CANCELLED';
  /** An order (one 1,200 taka polo ×2), its timeline steps at the hours given, and its purchase event's browser facts. */
  async function order(o: { steps: { to: To; hoursAgo: number }[]; status?: To; internalFlags?: string[]; phone?: string }) {
    const number = `F532-${++n}`;
    const customer = await t.prisma.customer.create({ data: { storeId: S, name: `Sample buyer ${n}`, phone: `+88017120000${String(n).padStart(2, '0')}` }, select: { id: true } }); // hardcode-ok: made-up test numbers
    const made = await t.prisma.order.create({
      data: {
        storeId: S,
        number,
        source: 'WEBSITE',
        currency: 'BDT',
        subtotalMinor: 240_000,
        deliveryChargeMinor: 12_000,
        totalMinor: 252_000,
        idempotencyKey: `f532-${n}`,
        customerId: customer.id,
        visitorId: `visitor-${n}`,
        phone: o.phone ?? '+8801712000000',
        email: 'sample@example.com',
        status: o.status ?? o.steps.at(-1)?.to ?? 'CONFIRMED',
        internalFlags: o.internalFlags ?? [],
        paymentMethod: 'COD',
        utmSource: 'facebook',
        utmCampaign: 'Sample winter',
        adPlatform: 'meta',
        placedAt: hoursAgo(60),
      },
    });
    await t.prisma.orderItem.create({ data: { storeId: S, orderId: made.id, sku: 'F532-POLO-M', productName: 'Sample polo', colourName: 'Navy', sizeLabel: 'M', quantity: 2, unitPriceMinor: 120_000, lineTotalMinor: 240_000 } });
    for (const st of o.steps) await t.prisma.orderEvent.create({ data: { storeId: S, orderId: made.id, type: 'order.status', toStatus: st.to, actorType: 'SYSTEM', source: 'test', createdAt: hoursAgo(st.hoursAgo) } });
    await t.prisma.trackedEvent.create({ data: { storeId: S, eventId: `purchase-${number}`, name: 'purchase', url: `https://${HOST}/checkout`, valueMinor: 252_000, currency: 'BDT', orderId: made.id, userData: { ext: hashId(customer.id), ua: UA }, deliveries: {}, pending: false, occurredAt: hoursAgo(60) } });
    return { id: made.id, number, customerId: customer.id, visitorId: `visitor-${n}` };
  }
  const ev = (eventId: string) => t.prisma.trackedEvent.findFirst({ where: { storeId: S, eventId } });
  const set = async (key: 'ads.conversionFeed' | 'ads.deliveredPurchase' | 'ads.tracking', patch: Record<string, unknown>) => {
    const v = await deps.resolver.value(key, { storeId: S });
    await deps.resolver.set(key, { ...v, ...patch } as never, storeTarget(S), { actorId: null, reason: 'test' });
  };
  const sentTo = (platform: string): Sent[] =>
    mockAdOutbox
      .all()
      .filter((m) => m.platform === platform)
      .flatMap((m) => (platform === 'meta' ? (m.payload as { data: Sent[] }).data : []));

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

  it('is off as it ships: nothing read, and the card is version-checked, refused when wrong and audited', async () => {
    await set('ads.tracking', { on: true, platforms: { meta: true, google: true, tiktok: false } });
    await set('ads.deliveredPurchase', { on: true });
    await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 5 }] });
    expect(await recordFeedSteps(deps, S)).toMatchObject({ recorded: 0, skipped: 'off' });
    const card = (await api('GET')).a.overview.feed;
    expect(card.value).toMatchObject({ on: false, generous: { meta: true, google: false, tiktok: false } });
    expect((await api('GET')).a.cards).toHaveProperty('feed');
    expect((await api('PUT', { key: 'feed', value: { ...card.value, on: true }, version: 'old' })).a.error).toBe('STALE');
    expect((await api('PUT', { key: 'feed', value: { ...card.value, holdHours: 99 }, version: card.version })).a.error).toBe('INVALID_INPUT');
    const saved = await api('PUT', { key: 'feed', value: { ...card.value, on: true }, version: card.version });
    expect(saved.status).toBe(200);
    expect(saved.a.overview.feed.value.on).toBe(true);
    expect(saved.a.overview.flagOptions.map((f) => f.key)).toContain('vip');
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.tracking.feed' } })).toBe(1);
    // the feed rides on delivered sales
    await set('ads.deliveredPurchase', { on: false });
    expect(await recordFeedSteps(deps, S)).toMatchObject({ skipped: 'off' });
    await set('ads.deliveredPurchase', { on: true });
  });

  it('handed to the courier and came back: one event each, never twice, to every ticked platform', async () => {
    const back = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 30 }, { to: 'RETURNED', hoursAgo: 2 }] });
    const run = await recordFeedSteps(deps, S);
    expect(run.recorded).toBeGreaterThanOrEqual(3);
    expect(await ev(`shipped-${back.number}`)).toMatchObject({ name: 'shipped', valueMinor: 240_000, deliveries: { meta: { state: 'mock' }, google: { state: 'mock' } } });
    expect(await ev(`returned-${back.number}`)).toMatchObject({ name: 'returned', valueMinor: 240_000 });
    expect((await recordFeedSteps(deps, S)).recorded).toBe(0);
    expect(await t.prisma.trackedEvent.count({ where: { eventId: `shipped-${back.number}` } })).toBe(1);
  });

  it('the qualified sale waits the hours, counts a delivery at once and is held back only when cancelled or marked bad', async () => {
    const early = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 1 }] });
    const due = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 3 }] });
    const delivered = await order({ steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    const cancelled = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 5 }], status: 'CANCELLED' });
    const flagged = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 5 }], internalFlags: ['complaint-before'] });
    const listed = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 5 }], phone: '+8801712999999' });
    await t.prisma.riskBlock.create({ data: { storeId: S, phone: '+8801712999999', reason: 'Sample refusal' } });
    await set('ads.conversionFeed', { holdFlags: { 'complaint-before': true } });
    const run = await recordFeedSteps(deps, S);
    expect(run.held).toMatchObject({ cancelled: 1, flag: 1, blocked: 1 });
    expect(run.notYet).toBeGreaterThanOrEqual(1);
    expect(await ev(`qualified-${early.number}`)).toBeNull();
    const q = await ev(`qualified-${due.number}`);
    expect(q).toMatchObject({ name: 'qualified', valueMinor: 240_000 });
    expect(Math.abs(q!.occurredAt.getTime() - hoursAgo(1).getTime())).toBeLessThan(60_000); // hand-off + 2 hours
    expect(q!.deliveries).toEqual({ meta: expect.objectContaining({ state: 'mock' }) }); // the generous platform only
    expect(await ev(`qualified-${delivered.number}`)).toMatchObject({ name: 'qualified' });
    for (const x of [cancelled, flagged, listed]) expect(await ev(`qualified-${x.number}`)).toBeNull();
    // the flag taken off: it counts at the next read
    await set('ads.conversionFeed', { holdFlags: {} });
    await recordFeedSteps(deps, S);
    expect(await ev(`qualified-${flagged.number}`)).not.toBeNull();
  });

  it('on the generous platform the qualified sale is the purchase, with the outcome and the intent; never the contact', async () => {
    const o = await order({ steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    // the visitor looked at products and opened the checkout before ordering (and the customer had a delivery before)
    for (const [name, h] of [['view', 70], ['view', 65], ['addToBag', 64], ['checkout', 61], ['view', 300]] as const)
      await t.prisma.trackedEvent.create({ data: { storeId: S, eventId: `${name}-${o.number}-${h}`, name, valueMinor: null, currency: 'BDT', userData: { ext: hashId(o.visitorId) }, deliveries: {}, pending: false, occurredAt: hoursAgo(h) } });
    await t.prisma.order.create({ data: { storeId: S, number: `F532-old-${n}`, source: 'WEBSITE', currency: 'BDT', subtotalMinor: 1, deliveryChargeMinor: 0, totalMinor: 1, idempotencyKey: `f532-old-${n}`, customerId: o.customerId, status: 'DELIVERED', deliveredAt: hoursAgo(500), placedAt: hoursAgo(520) } });
    await t.prisma.trackedEvent.update({ where: { storeId_eventId: { storeId: S, eventId: `purchase-${o.number}` } }, data: { pending: true, deliveries: { meta: { state: 'waiting', attempts: 0 }, google: { state: 'waiting', attempts: 0 } } } });
    mockAdOutbox.clear();
    const { status, a } = await api('POST', { action: 'send' });
    expect(status).toBe(200);
    expect(a.outcome!.feed!.recorded).toBeGreaterThanOrEqual(1);
    const meta = sentTo('meta');
    const sale = meta.find((d) => d.event_id === `qualified-${o.number}`)!;
    expect(sale).toMatchObject({ event_name: 'Purchase', custom_data: { value: 2400, order_id: o.number, outcome: 'delivered', payment: 'cod', channel: 'facebook', campaign: 'Sample winter', ad_click: true, returning_customer: true, views: 2, bag_adds: 1, checkouts: 1 } });
    expect(meta.find((d) => d.event_id === `purchase-${o.number}`)).toMatchObject({ event_name: 'OrderPlaced', custom_data: { outcome: 'placed' } });
    expect(meta.find((d) => d.event_id === `delivered-${o.number}`)?.event_name ?? 'OrderDelivered').toBe('OrderDelivered');
    // Google is not generous: the order placed stays its purchase there, and it never gets the qualified sale
    const google = mockAdOutbox.all().filter((m) => m.platform === 'google').flatMap((m) => m.payload as { events: { name: string; params: Record<string, unknown> }[] }[]);
    expect(google.find((g) => g.events[0]!.params.event_id === `purchase-${o.number}`)!.events[0]).toMatchObject({ name: 'purchase', params: { outcome: 'placed', channel: 'facebook' } });
    expect(google.some((g) => g.events[0]!.params.event_id === `qualified-${o.number}`)).toBe(false);
    expect(JSON.stringify(mockAdOutbox.all().map((m) => m.payload))).not.toMatch(/8801712|sample@example|Sample buyer/);
    expect(a.overview.recorded).toMatchObject({ qualified: expect.any(Number), shipped: expect.any(Number), returned: expect.any(Number) });
  });

  it('PR 532 follow-up (662): the extra data is kept at the first send; a retry later sends it as it was then', async () => {
    const o = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 30 }] });
    mockAdOutbox.clear();
    await recordFeedSteps(deps, S);
    const first = await ev(`shipped-${o.number}`);
    expect(first!.extra).toMatchObject({ courier: { outcome: 'with_courier', payment: 'cod' }, intent: { channel: 'facebook' } });
    // the order changes afterwards (paid another way, came from elsewhere); the platform's copy is tried again
    await t.prisma.order.update({ where: { id: o.id }, data: { paymentMethod: 'BKASH', utmSource: 'google' } });
    await t.prisma.trackedEvent.update({ where: { id: first!.id }, data: { pending: true, deliveries: { meta: { state: 'failed', attempts: 1 } } } });
    mockAdOutbox.clear();
    await sendEvents(deps, { ids: [first!.id] });
    const again = sentTo('meta').find((d) => d.event_id === `shipped-${o.number}`)!;
    expect(again.custom_data).toMatchObject({ outcome: 'with_courier', payment: 'cod', channel: 'facebook' });
    expect((await ev(`shipped-${o.number}`))!.extra).toEqual(first!.extra);
    // a part switched off since: it stops for what still waits
    await set('ads.conversionFeed', { enrich: { courier: true, intent: false } });
    await t.prisma.trackedEvent.update({ where: { id: first!.id }, data: { pending: true, deliveries: { meta: { state: 'failed', attempts: 1 } } } });
    mockAdOutbox.clear();
    await sendEvents(deps, { ids: [first!.id] });
    const third = sentTo('meta').find((d) => d.event_id === `shipped-${o.number}`)!;
    expect(third.custom_data).toMatchObject({ outcome: 'with_courier' });
    expect(third.custom_data).not.toHaveProperty('channel');
    await set('ads.conversionFeed', { enrich: { courier: true, intent: true } });
  });

  it('PR 532 follow-up (661): a returned parcel withdraws the purchase GA4 already took, only while allowed', async () => {
    const gaOf = (eventId: string) =>
      mockAdOutbox
        .all()
        .filter((m) => m.platform === 'google')
        .flatMap((m) => m.payload as { events: { name: string; params: Record<string, unknown> }[] }[])
        .find((g) => g.events[0]!.params.event_id === eventId)?.events[0];
    const took = async (o: { number: string }) => t.prisma.trackedEvent.update({ where: { storeId_eventId: { storeId: S, eventId: `purchase-${o.number}` } }, data: { deliveries: { google: { state: 'mock', attempts: 1 } } } });
    // off as it ships: the return goes as its own event
    const a = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 20 }, { to: 'RETURNED', hoursAgo: 2 }] });
    await took(a);
    mockAdOutbox.clear();
    await recordFeedSteps(deps, S);
    expect(gaOf(`returned-${a.number}`)).toMatchObject({ name: 'order_returned' });
    // on: GA4 (it took the order's purchase) gets its refund with the same order number; Meta keeps the return
    await set('ads.conversionFeed', { withdrawOnReturn: true });
    const b = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 20 }, { to: 'RETURNED', hoursAgo: 2 }] });
    const c = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 20 }, { to: 'RETURNED', hoursAgo: 2 }] });
    await took(b); // c's purchase never reached GA4: nothing to take back there
    mockAdOutbox.clear();
    await recordFeedSteps(deps, S);
    expect(gaOf(`returned-${b.number}`)).toMatchObject({ name: 'refund', params: { transaction_id: b.number, value: 2400 } });
    expect(gaOf(`returned-${c.number}`)).toMatchObject({ name: 'order_returned' });
    expect(sentTo('meta').find((d) => d.event_id === `returned-${b.number}`)).toMatchObject({ event_name: 'OrderReturned' });
    await set('ads.conversionFeed', { withdrawOnReturn: false });
  });

  it('enrichment switched off: the events go plain', async () => {
    await set('ads.conversionFeed', { enrich: { courier: false, intent: false } });
    const o = await order({ steps: [{ to: 'DELIVERED', hoursAgo: 1 }] });
    mockAdOutbox.clear();
    await recordFeedSteps(deps, S);
    const sale = sentTo('meta').find((d) => d.event_id === `qualified-${o.number}`)!;
    expect(sale.custom_data).not.toHaveProperty('outcome');
    expect(sale.custom_data).not.toHaveProperty('views');
  });

  it('follow-up 663: a run reads the whole window page by page, not only its oldest rows; each order and step judged once', async () => {
    // the window's oldest rows are all recorded already: before 663 a run read only those and never got further
    await recordFeedSteps(deps, S, { send: false });
    const later = [];
    for (let i = 0; i < 4; i += 1) later.push(await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 0.5 - i * 0.05 }] }));
    // handed over, then delivered within the hours: judged at its first row (the hand-off: not yet), never at the later one
    const both = await order({ steps: [{ to: 'HANDED_OVER', hoursAgo: 0.3 }, { to: 'DELIVERED', hoursAgo: 0.1 }] });
    const run = await recordFeedSteps(deps, S, { page: 2, send: false });
    const rows = await t.prisma.orderEvent.count({ where: { storeId: S, toStatus: { in: ['HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'] }, createdAt: { gte: hoursAgo(48) } } });
    expect(run.scanned).toBeGreaterThan(2);
    expect(run.scanned).toBeLessThanOrEqual(rows);
    for (const x of later) expect(await ev(`shipped-${x.number}`)).not.toBeNull();
    expect(await ev(`shipped-${both.number}`)).not.toBeNull();
    expect(await ev(`qualified-${both.number}`)).toBeNull();
    // one row a page reads the same and records nothing twice
    expect((await recordFeedSteps(deps, S, { page: 1, send: false })).recorded).toBe(0);
    expect(await ev(`qualified-${both.number}`)).toBeNull();
  });
});
