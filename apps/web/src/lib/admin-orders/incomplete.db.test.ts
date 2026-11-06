// S13 · PR 274 — Orders › Incomplete on a real PostgreSQL (SIM-F-026 acceptance): off as shipped; a checkout typed
// and left shows only after the owner's minutes, hottest first, with its bag, its worth (a set once at its set
// price) and the visit's campaign; an ordered one or one without a number never shows; a bag with no number is only
// counted; a prepaid order whose payment failed (or got no answer) is listed beside them; a person with
// `orders.confirm` hands one to a teammate, marks it handled with a note and opens it again (audited); a reader cannot;
// the card saves the switch, the days and the minutes with `settings.write` only. A throwaway database (skipped
// without TEST_DATABASE_ADMIN_URL). Sample values only.
// PR 275: the follow-up card — off as shipped, saved with `settings.write`, the offer only with one of the shop's live
// codes (written as the code is), audited; each row says what went to him, the card how many went and came back.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { incompleteHandler, incompleteOpenCount, type IncompleteOverview } from './incomplete';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = new Date('2026-11-06T08:00:00Z');
const MIN = 60_000;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.47', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/orders/incomplete'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Orders › Incomplete on PostgreSQL (PR 274, SIM-F-026)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let reader = '';
  let ownerId = '';
  type Answer = IncompleteOverview & { ok: boolean; error?: string; details?: string[]; cards?: { incomplete?: IncompleteOverview['card']; followUp?: IncompleteOverview['followUp']['card'] }; id?: string };
  const api = async (method: string, o: { body?: unknown; cookie?: string; view?: string } = {}) => {
    const res = await incompleteHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: `/api/admin/orders/incomplete${o.view ? `?view=${o.view}` : ''}` }), admin, { now: () => T0 });
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    t = await createTestDatabase('web_incomplete');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    ownerId = (await t.prisma.staffUser.findFirstOrThrow({ where: { email: 'owner@example.com' } })).id;
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Order reader', nameBn: 'অর্ডার দেখা', permissions: ['orders.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'reader@example.com', displayName: 'Sample reader', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'reader@example.com', password: 'first password from the owner' } }), admin));
    reader = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  }, 120_000);
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped and empty; the card saves only with settings.write and checks its numbers', async () => {
    const g = await api('GET', { cookie: reader });
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ view: 'open', capture: false, counts: { open: 0, mine: 0, handled: 0 }, rows: [], unpaid: [], noPhone: { bags: 0, valueMinor: 0 } });
    expect(g.a.card.value).toEqual({ capture: false, keepDays: registry['checkout.capture.keepDays'].default, leftAfterMinutes: 30 });
    expect(g.a.staff.map((p) => p.name)).toEqual(['Sample owner']);
    const value = { capture: true, keepDays: 14, leftAfterMinutes: 45 };
    expect((await api('PUT', { cookie: reader, body: { key: 'incomplete', value, version: g.a.card.version } })).status).toBe(403);
    expect((await api('PUT', { body: { key: 'incomplete', value: { ...value, leftAfterMinutes: 2, keepDays: 0 }, version: g.a.card.version } })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['keepDays', 'leftAfterMinutes'] });
    expect((await api('PUT', { body: { key: 'incomplete', value, version: 'old' } })).a.error).toBe('STALE');
    const put = await api('PUT', { body: { key: 'incomplete', value, version: g.a.card.version } });
    expect(put.status).toBe(200);
    expect(put.a.cards!.incomplete!.value).toEqual(value);
    expect(await admin.resolver.value('checkout.capture.enabled', { storeId: S })).toBe(true);
    expect(await admin.resolver.value('orders.incomplete', { storeId: S })).toEqual({ leftAfterMinutes: 45 });
    expect(await t.prisma.auditLog.count({ where: { action: 'incomplete.settings' } })).toBe(1);
  });

  it('lists checkouts left after the minutes, hottest first, with the bag, its worth and the campaign; counts a bag with no number; lists an unfinished payment', async () => {
    const shirt = await t.prisma.product.create({ data: { storeId: S, slug: 'sample-polo-274', nameEn: 'Sample polo', nameBn: 'স্যাম্পল পোলো' } });
    const v = await t.prisma.productVariant.create({ data: { storeId: S, productId: shirt.id, sku: 'SAMPLE-274-M', priceMinor: 150_000 } });
    const ago = (m: number) => new Date(T0.getTime() - m * MIN);
    const bag = async (visitorId: string, at: Date, lines: { quantity: number; unitPriceMinor: number; comboGroupKey?: string; setPriceMinor?: number; source?: string }[]) => {
      const c = await t.prisma.cart.create({ data: { storeId: S, visitorId, lastActivityAt: at } });
      for (const l of lines) await t.prisma.cartItem.create({ data: { storeId: S, cartId: c.id, variantId: v.id, ...l } });
      return c.id;
    };
    const draft = async (visitorId: string, at: Date, step: string, extra: Record<string, unknown> = {}) =>
      t.prisma.checkoutDraft.create({ data: { storeId: S, visitorId, phone: `+88017110002${visitorId.slice(-2)}`, name: `Sample ${visitorId}`, addressText: 'House 1, Road 2', lastStep: step, lastActivityAt: at, cartId: await bag(visitorId, at, [{ quantity: 2, unitPriceMinor: 150_000, source: 'lp-x' }]), ...extra } });
    const hot = await draft('visitor-hot-41', ago(60), 'payment', { data: { attribution: { adPlatform: 'META', utmSource: 'facebook', utmCampaign: 'eid-polo', utmMedium: null, referrer: null } } });
    const warm = await draft('visitor-warm-42', ago(50), 'delivery');
    const cold = await draft('visitor-cold-43', ago(46), 'details');
    await draft('visitor-fresh-44', ago(10), 'payment'); // still typing (under 45 minutes)
    await draft('visitor-old-45', ago(15 * 24 * 60), 'payment'); // older than the 14 kept days
    await draft('visitor-done-46', ago(60), 'payment', { convertedOrderId: '00000000-0000-7000-8000-000000000274' });
    await t.prisma.checkoutDraft.create({ data: { storeId: S, visitorId: 'visitor-nophone-47', lastStep: 'details', lastActivityAt: ago(60) } });
    // a set counted once at its set price, in a bag that never kept a number
    await bag('visitor-bag-48', ago(90), [
      { quantity: 1, unitPriceMinor: 120_000 },
      { quantity: 1, unitPriceMinor: 100_000, comboGroupKey: 'set-1', setPriceMinor: 180_000 },
    ]);
    await t.prisma.cartItem.updateMany({ where: { cart: { visitorId: 'visitor-warm-42' } }, data: { comboGroupKey: 'set-w', setPriceMinor: 250_000 } });
    // a prepaid order whose payment failed, one still waiting past the minutes, one paid
    const order = async (num: string, status: 'FAILED' | 'INITIATED' | 'PAID', flags: string[]) => {
      const o = await t.prisma.order.create({ data: { storeId: S, number: num, source: 'WEBSITE', currency: 'BDT', placedAt: ago(120), paymentMethod: 'BKASH', subtotalMinor: 150_000, totalMinor: 150_000, idempotencyKey: `idem-${num}`, phone: '+8801711000299', customerName: 'Sample payer', status: 'PLACED', flags } });
      await t.prisma.payment.create({ data: { storeId: S, orderId: o.id, method: 'BKASH', provider: 'bkash', purpose: 'ORDER', status, amountMinor: 150_000, currency: 'BDT', idempotencyKey: `idem-${num}:pay:1`, statusAt: ago(100) } });
    };
    await order('S-2741', 'FAILED', ['PAYMENT_FAILED']);
    await order('S-2742', 'INITIATED', ['PAYMENT_PENDING']);
    await order('S-2743', 'PAID', []);

    const g = await api('GET', { cookie: reader });
    expect(g.a.counts).toEqual({ open: 3, mine: 0, handled: 0 });
    expect(g.a.rows.map((r) => [r.id, r.stage])).toEqual([
      [hot.id, 'payment'],
      [warm.id, 'address'],
      [cold.id, 'phone'],
    ]);
    expect(g.a.rows[0]).toMatchObject({ phone: '+8801711000241', name: 'Sample visitor-hot-41', valueMinor: 300_000, lines: [{ nameEn: 'Sample polo', nameBn: 'স্যাম্পল পোলো', quantity: 2 }], more: 0, channel: { platform: 'META', source: 'facebook', campaign: 'eid-polo', landing: true }, assignedTo: null, handled: null });
    expect(g.a.rows[1]!.valueMinor).toBe(250_000);
    expect(g.a.noPhone).toEqual({ bags: 1, valueMinor: 220_000 });
    expect(g.a.unpaid.map((u) => [u.number, u.state])).toEqual([
      ['S-2741', 'failed'],
      ['S-2742', 'pending'],
    ]);
    expect(await incompleteOpenCount({ db: t.prisma, resolver: admin.resolver, now: () => T0 })).toBe(3);
  });

  it('hands one to a teammate, marks it handled with a note and opens it again, audited; a reader cannot act', async () => {
    const id = (await api('GET')).a.rows[0]!.id;
    expect((await api('POST', { cookie: reader, body: { action: 'handled', id } })).status).toBe(403);
    expect((await api('POST', { body: { action: 'assign', id, staffUserId: '00000000-0000-7000-8000-000000000001' } })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['staffUserId'] });
    expect((await api('POST', { body: { action: 'assign', id: '00000000-0000-7000-8000-000000000002', staffUserId: ownerId } })).a.error).toBe('NOT_FOUND');
    expect((await api('POST', { body: { action: 'assign', id, staffUserId: ownerId } })).status).toBe(200);
    const mine = await api('GET', { view: 'mine' });
    expect(mine.a.rows.map((r) => [r.id, r.assignedTo?.name])).toEqual([[id, 'Sample owner']]);
    expect((await api('POST', { body: { action: 'handled', id, note: 'x'.repeat(301) } })).a.error).toBe('INVALID_INPUT');
    expect((await api('POST', { body: { action: 'handled', id, note: '  called, orders after payday ' } })).status).toBe(200);
    expect((await api('POST', { body: { action: 'handled', id } })).a.error).toBe('HANDLED');
    const handled = await api('GET', { view: 'handled' });
    expect(handled.a.counts).toEqual({ open: 2, mine: 0, handled: 1 });
    expect(handled.a.rows[0]!.handled).toMatchObject({ by: 'Sample owner', note: 'called, orders after payday' });
    expect((await api('POST', { body: { action: 'reopen', id } })).status).toBe(200);
    expect((await api('POST', { body: { action: 'reopen', id } })).a.error).toBe('OPEN');
    expect((await api('GET')).a.counts).toEqual({ open: 3, mine: 1, handled: 0 });
    expect((await api('POST', { body: { action: 'assign', id, staffUserId: null } })).status).toBe(200);
    expect((await api('POST', { body: { action: 'nothing', id } })).a.error).toBe('INVALID_INPUT');
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['incomplete.assign', 'incomplete.handled', 'incomplete.reopen'] }, entityId: id } })).toBe(4);
  });

  it('PR 275: the follow-up card is off as shipped; the offer needs a live code; a row shows what went to him; the card counts what went and came back', async () => {
    const g = await api('GET', { cookie: reader });
    expect(g.a.followUp).toMatchObject({ sent: 0, recovered: 0, ceiling: 2 });
    expect(g.a.followUp.card.value).toEqual({ enabled: false, firstAfterMinutes: 60, channels: 'WHATSAPP,SMS', minStep: 'details', catchUpHours: 24, phoneGapDays: 7, offer: false, offerAfterHours: 24, offerCode: '' });
    const v0 = g.a.followUp.card.version;
    const on = { ...g.a.followUp.card.value, enabled: true, channels: 'SMS,WHATSAPP', minStep: 'delivery' };
    expect((await api('PUT', { cookie: reader, body: { key: 'followUp', value: on, version: v0 } })).status).toBe(403);
    expect((await api('PUT', { body: { key: 'followUp', value: { ...on, channels: 'EMAIL', firstAfterMinutes: 5 }, version: v0 } })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['firstAfterMinutes', 'channels'] });
    expect((await api('PUT', { body: { key: 'followUp', value: { ...on, offer: true, offerCode: 'NOPE275' }, version: v0 } })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['offerCode'] });
    expect((await api('PUT', { body: { key: 'followUp', value: { ...on, offer: true }, version: v0 } })).a).toMatchObject({ error: 'INVALID_INPUT', details: ['offerCode'] });
    const saved = await api('PUT', { body: { key: 'followUp', value: on, version: v0 } });
    expect(saved.a.cards?.followUp?.value).toMatchObject({ enabled: true, channels: 'SMS,WHATSAPP', minStep: 'delivery', offer: false });
    expect(await admin.resolver.value('orders.followUp', { storeId: S })).toMatchObject({ enabled: true, channels: ['SMS', 'WHATSAPP'], minStep: 'delivery' });
    await t.prisma.coupon.create({ data: { storeId: S, code: 'BACK275', kind: 'AMOUNT_OFF', value: { amountMinor: 5_000 }, enabled: true } });
    const offer = await api('PUT', { body: { key: 'followUp', value: { ...saved.a.cards!.followUp!.value, offer: true, offerCode: 'back275' }, version: saved.a.cards!.followUp!.version } });
    expect(offer.a.cards?.followUp?.value).toMatchObject({ offer: true, offerCode: 'BACK275' });
    expect(await t.prisma.auditLog.count({ where: { action: 'incomplete.followUp' } })).toBe(2);

    const row = (await api('GET')).a.rows[0]!;
    expect(row.followUps).toEqual({ sent: 0, last: null });
    const sentAt = new Date(T0.getTime() - 30 * MIN);
    await t.prisma.recoveryMessage.create({ data: { storeId: S, kind: 'INCOMPLETE', checkoutDraftId: row.id, attempt: 1, channel: 'SMS', sentAt } });
    const after = await api('GET');
    expect(after.a.rows.find((r) => r.id === row.id)!.followUps).toEqual({ sent: 1, last: { at: sentAt.toISOString(), channel: 'SMS', offer: false } });
    expect(after.a.followUp).toMatchObject({ sent: 1, recovered: 0 });
  });
});
