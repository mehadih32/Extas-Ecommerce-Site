// PR 303 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the customer report — off as shipped (nothing counted), `reports.read` needed, new / returning / quiet buyers and the
// repeat rate over a period on the Customers list's own people (a merged profile under its survivor, a guest order by
// his number, drafts and archived orders left out), the owner's quiet days, and the split by saved segment only while
// segments are on (newest first, at most `segmentsShown`). Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM } from '@extas/auth';
import { mergeCustomers } from './merge';
import { customerReport } from './report';
import { saveSegment } from './segments';
import { setUpCustomers, type CustomersFixture } from './testing';
import type { Who } from './context';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700003031', a2: '+8801900003031', b: '+8801700003032', c: '+8801700003033', d: '+8801700003034', e: '+8801700003035' };
const DAY = 86_400_000;

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('customer report on PostgreSQL (PR 303)', () => {
  let f: CustomersFixture;
  let reader: Who;
  const ids: Record<string, string> = {};
  let n = 0;

  async function order(customerId: string | null, phone: string, daysAgo: number, o: { status?: 'PLACED' | 'DELIVERED' | 'DRAFT'; archived?: boolean } = {}) {
    n += 1;
    const status = o.status ?? 'DELIVERED';
    const placed = new Date(f.clock.now.getTime() - daysAgo * DAY);
    await f.t.prisma.order.create({
      data: { storeId: f.S, number: `R303-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: placed, deliveredAt: status === 'DELIVERED' ? placed : null, subtotalMinor: 1_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_000, paymentMethod: 'COD', customerId, phone, idempotencyKey: `r303-${n}`, archivedAt: o.archived ? placed : null },
    });
  }
  const report = (who: Who = reader, days = 30) => customerReport(f.customersDeps(), who, { from: new Date(f.clock.now.getTime() - days * DAY) });
  const on = (v: Partial<{ quietDays: number; segmentsShown: number }> = {}) => f.overrides.set('customers.report', { enabled: true, quietDays: 60, segmentsShown: 10, ...v });

  beforeAll(async () => {
    f = await setUpCustomers('customers-report');
    const p = f.t.prisma;
    await p.customer.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    await p.order.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    const role = await createRole(p, SYSTEM, { key: 'test-reports-read', nameEn: 'report reader', nameBn: 'report reader', permissions: ['reports.read'] });
    const r = await p.staffUser.create({ data: { email: 'report-reader@example.com', displayName: 'Report Reader', passwordHash: 'not-a-login' } });
    await p.staffRoleAssignment.create({ data: { staffUserId: r.id, roleId: role.id, storeId: f.S } });
    reader = { actor: { staffUserId: r.id }, storeId: f.S };
    for (const k of Object.keys(N) as (keyof typeof N)[]) ids[k] = await f.profile({ phone: N[k] });
    // a: first order 200 days ago on his second profile (merged into a), again 5 days ago -> returning, a repeater
    await order(ids.a2!, N.a2, 200);
    await order(ids.a!, N.a, 5);
    // b: his first order ever 10 days ago, then a guest order by his number 3 days ago -> new, a repeater
    await order(ids.b!, N.b, 10, { status: 'PLACED' });
    await order(null, N.b, 3, { status: 'PLACED' });
    // c: one order 100 days ago -> quiet (60+ days, nothing in the period)
    await order(ids.c!, N.c, 100);
    // d: one order 40 days ago -> neither (not in the 30 days, not yet quiet); a draft in the period does not count
    await order(ids.d!, N.d, 40);
    await order(ids.d!, N.d, 2, { status: 'DRAFT' });
    // e: only an archived order in the period -> nothing
    await order(ids.e!, N.e, 4, { archived: true });
    await mergeCustomers(f.customersDeps(), f.manager, { survivorId: ids.a, mergedId: ids.a2 });
  });
  afterAll(async () => f?.t.drop());

  it('off as shipped: nothing counted', async () => {
    const r = await report();
    expect(r.enabled).toBe(false);
    expect(r.totals).toBeNull();
    expect(r.segments).toEqual([]);
  });

  it('needs reports.read', async () => {
    on();
    await expect(report(f.viewer)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('counts new, returning, quiet and the repeat rate over the period, one person per survivor', async () => {
    on();
    const r = await report();
    expect(r.totals).toEqual({ buyers: 2, newBuyers: 1, returning: 1, quiet: 1, repeaters: 2, repeatRate: 1 });
    expect(r.quietDays).toBe(60);
  });

  it("the owner's quiet days and the period change who counts", async () => {
    on({ quietDays: 30 });
    expect((await report()).totals).toMatchObject({ quiet: 2 });
    on();
    // 7 days: b's first order (10 days ago) is before the period -> returning; a returning; d is not yet quiet
    expect((await report(reader, 7)).totals).toMatchObject({ buyers: 2, newBuyers: 0, returning: 2, quiet: 1 });
    await expect(customerReport(f.customersDeps(), reader, { from: f.clock.now })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('splits by saved segment only while segments are on, newest first, at most segmentsShown', async () => {
    on();
    expect((await report()).segmentsOn).toBe(false);
    f.overrides.set('customers.segments', { enabled: true, maxSegments: 10, maxConditions: 5, previewShown: 5 });
    await saveSegment(f.customersDeps(), f.manager, null, { name: 'Two orders', definition: { v: 1, all: [{ field: 'ordersMin', value: 2 }] } });
    await saveSegment(f.customersDeps(), f.manager, null, { name: 'Everyone', definition: { v: 1, all: [] } });
    const r = await report();
    expect(r.segmentsOn).toBe(true);
    expect(r.segments.map((s) => s.name)).toEqual(['Everyone', 'Two orders']);
    expect(r.segments[1]).toMatchObject({ people: 2, buyers: 2, newBuyers: 1, returning: 1, quiet: 0 });
    expect(r.segments[0]).toMatchObject({ people: 5, buyers: 2, quiet: 1 });
    on({ segmentsShown: 1 });
    const one = await report();
    expect(one.segments.map((s) => s.name)).toEqual(['Everyone']);
    expect(one.segmentsMore).toBe(1);
  });
});
