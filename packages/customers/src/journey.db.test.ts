// PR 288 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the journey view — off as shipped; on, every touch of the person over both his profiles in order, newest first: the
// profiles with where they came from, a browsing session as one visit (from his own id or an order's visitor), an order
// with its campaign and its delivery, an exchange, a message, a consent change, a merge, a staff note; "how he first
// came"; the owner's kinds and page size; wallet lines only for those who may see money; no phone number in any row.
// Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { customerJourney } from './journey';
import { crmSettingsScreen, saveCrmSetting } from './settings';
import { mergeCustomers } from './merge';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700002881', a2: '+8801900002881' };
const DAY = 86_400_000;

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('the customer journey on PostgreSQL (PR 288)', () => {
  let f: CustomersFixture;
  let a = '';
  let a2 = '';
  let orderId = '';
  const ago = (d: number) => new Date(f.clock.now.getTime() - d * DAY);
  const on = (extra: Record<string, unknown> = {}) => f.overrides.set('customers.journey', { enabled: true, kinds: ['profile', 'visit', 'touch', 'order', 'exchange', 'message', 'chat', 'review', 'wallet', 'consent', 'merge', 'note'], perPage: 50, ...extra });

  beforeAll(async () => {
    f = await setUpCustomers('customers-journey');
    const p = f.t.prisma;
    a = await f.profile({ phone: N.a, name: 'Rahim Uddin', createdAt: ago(30) });
    a2 = await f.profile({ phone: N.a2, name: 'Rahim (office)', createdAt: ago(10) });
    await p.customer.update({ where: { id: a }, data: { firstSource: 'WEBSITE', firstCampaignRef: 'eid-polo' } });
    // a browsing session before he ordered (his visitor id is on the order), and one after, signed in
    for (const [i, d] of [[1, 29], [2, 29], [3, 29]] as const) await p.analyticsEvent.create({ data: { storeId: f.S, name: 'page_view', isLoggedIn: false, visitorId: 'v-288', sessionId: 's-288-a', occurredAt: new Date(ago(d).getTime() + i * 1000) } });
    await p.analyticsEvent.create({ data: { storeId: f.S, name: 'page_view', isLoggedIn: true, visitorId: 'v-288b', sessionId: 's-288-b', customerId: a, occurredAt: ago(5) } });
    const o = await p.order.create({
      data: { storeId: f.S, number: 'J288-1', source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: ago(28), deliveredAt: ago(25), subtotalMinor: 5_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 5_000, paymentMethod: 'COD', customerId: a, phone: N.a, idempotencyKey: 'j288-1', visitorId: 'v-288', utmSource: 'facebook', utmCampaign: 'eid-polo' },
    });
    orderId = o.id;
    await p.exchange.create({ data: { storeId: f.S, orderId: o.id, customerId: a, number: 'X288-1', reason: 'size', tier: 1, createdAt: ago(20) } });
    await p.notificationLog.create({ data: { storeId: f.S, orderId: o.id, customerId: a, channel: 'SMS', recipient: N.a, status: 'SENT', dedupeKey: 'j288-sms', step: 'delivered', createdAt: ago(25), sentAt: ago(25) } });
    await p.consentRecord.create({ data: { storeId: f.S, customerId: a, phone: N.a, channel: 'SMS', granted: false, source: 'stopWord', scope: 'MARKETING', createdAt: ago(15) } });
    await p.customerNote.create({ data: { storeId: f.S, customerId: a2, body: 'Prefers a call after 6 pm', createdAt: ago(2) } });
    const w = await p.walletAccount.create({ data: { storeId: f.S, customerId: a, status: 'ACTIVE' } });
    await p.walletEntry.create({ data: { storeId: f.S, walletId: w.id, direction: 'CREDIT', amountMinor: 500, balanceAfterMinor: 500, reason: 'apology', idempotencyKey: 'j288-w', createdAt: ago(24) } });
    await mergeCustomers(f.customersDeps(), f.manager, { survivorId: a, mergedId: a2 });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: nothing is read', async () => {
    const j = await customerJourney(f.customersDeps(), f.viewer, a);
    expect(j).toMatchObject({ enabled: false, rows: [], first: null });
  });

  it('on: every touch over both profiles, newest first; how he first came; no phone number anywhere', async () => {
    on();
    const j = await customerJourney(f.customersDeps(), f.viewer, a2); // a merged profile reads as its survivor
    const seq = j.rows.map((r) => r.what); // the merge is stamped by the database's own clock, so it is the newest
    expect(seq).toEqual(['merge.merged', 'note', 'visit', 'profile.other', 'consent.no', 'exchange', 'order.delivered', 'message', 'order.placed', 'visit', 'profile.first']);
    const visits = j.rows.filter((r) => r.kind === 'visit');
    expect(visits.map((v) => v.data.pages)).toEqual([1, 3]);
    const placed = j.rows.find((r) => r.what === 'order.placed')!;
    expect(placed).toMatchObject({ data: { number: 'J288-1', campaign: 'eid-polo', from: 'facebook', status: 'DELIVERED', total: null }, ref: { type: 'order', id: orderId } });
    expect(j.first).toMatchObject({ what: 'profile.first', data: { source: 'WEBSITE', campaign: 'eid-polo' } });
    expect(JSON.stringify(j.rows)).not.toContain('01700002881');
    expect(JSON.stringify(j.rows)).not.toContain('8801700002881');
    expect(j.rows.some((r) => r.kind === 'wallet')).toBe(false); // no `payments.view`
  });

  it('wallet lines and order totals only for someone who may see money', async () => {
    on();
    const role = await createRole(f.t.prisma, SYSTEM, { key: 'j288-money', nameEn: 'money', nameBn: 'money', permissions: ['customers.read', 'payments.view'] });
    const u = await f.t.prisma.staffUser.create({ data: { email: 'j288@example.com', displayName: 'Money', passwordHash: 'not-a-login' } });
    await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    const j = await customerJourney(f.customersDeps(), { actor: { staffUserId: u.id }, storeId: f.S }, a);
    expect(j.rows.find((r) => r.kind === 'wallet')).toMatchObject({ what: 'wallet.credit', data: { amount: 500, reason: 'apology' } });
    expect(j.rows.find((r) => r.what === 'order.placed')?.data.total).toBe(5_000);
  });

  it("the owner's kinds and page size", async () => {
    on({ kinds: ['order'], perPage: 10 });
    const j = await customerJourney(f.customersDeps(), f.viewer, a);
    expect(j.rows.map((r) => r.what)).toEqual(['order.delivered', 'order.placed']);
    expect(j.first).toMatchObject({ what: 'order.placed' });
    on({ perPage: 10 });
    const p1 = await customerJourney(f.customersDeps(), f.viewer, a);
    expect(p1.rows).toHaveLength(10);
    expect(p1.hasMore).toBe(true);
    const p2 = await customerJourney(f.customersDeps(), f.viewer, a, { page: 2 });
    expect(p2.rows.map((r) => r.what)).toEqual(['profile.first']);
    expect(p2.hasMore).toBe(false);
    await expect(customerJourney(f.customersDeps(), f.viewer, a, { page: 0 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(customerJourney(f.customersDeps(), f.viewer, '00000000-0000-7000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('Customer settings: the journey switch saved through its schema by the settings key only, audited', async () => {
    f.overrides.delete('customers.journey');
    const deps = () => ({ ...f.customersDeps(), settings: { ...f.customersDeps().settings, set: async (key: string, value: unknown) => void f.overrides.set(key, value) } });
    const screen = await crmSettingsScreen(deps(), f.viewer);
    expect(screen).toMatchObject({ canWrite: false, values: { 'customers.journey': { enabled: false } } });
    await expect(saveCrmSetting(deps(), f.viewer, { key: 'customers.journey', value: { ...screen.values['customers.journey'], enabled: true } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const role = await createRole(f.t.prisma, SYSTEM, { key: 'j288-settings', nameEn: 'crm', nameBn: 'crm', permissions: ['customers.read', 'customers.settings'] });
    const u = await f.t.prisma.staffUser.create({ data: { email: 'j288s@example.com', displayName: 'CRM', passwordHash: 'not-a-login' } });
    await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    const owner = { actor: { staffUserId: u.id }, storeId: f.S };
    await expect(saveCrmSetting(deps(), owner, { key: 'customers.segments', value: {} })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(saveCrmSetting(deps(), owner, { key: 'customers.journey', value: { enabled: true, kinds: ['gps'], perPage: 50 } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const saved = await saveCrmSetting(deps(), owner, { key: 'customers.journey', value: { ...screen.values['customers.journey'], enabled: true } });
    expect(saved.values['customers.journey'].enabled).toBe(true);
    expect(saved.canWrite).toBe(true);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'customer.settings.save', entityId: 'customers.journey' } })).toBe(1);
  });
});

