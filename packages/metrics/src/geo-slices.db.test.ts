// S29 · PR 756 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL; NOT run in the lane that wrote it, which had
// no database): the slices of the Geography map — an order-level slice narrows the orders, for any one dimension the
// parts add up to the whole with the unknowns apart, "new or repeat" counts the same customer (or, for a guest, the
// same phone) by earlier non-cancelled orders, and another store's or archived orders are never read. Made-up values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { geoSliceBreakdown, SLICE_DIMENSIONS, sumBuckets, UNKNOWN_BUCKET } from './geo-slices';

const TZ = 'Asia/Dhaka';

describe.skipIf(!HAS_TEST_DB)('PR 756 · geography slices on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  let courierA = '';
  let courierB = '';
  let ann = '';
  let bob = '';

  async function order(o: {
    source?: 'WEBSITE' | 'PHONE' | 'WHATSAPP';
    pay?: 'COD' | 'BKASH' | 'CASH' | null;
    status?: 'DELIVERED' | 'RETURNED' | 'PLACED' | 'CANCELLED';
    placed?: string;
    at?: string;
    courier?: string | null;
    customer?: string | null;
    phone?: string | null;
    store?: number;
    archived?: boolean;
    goods?: number;
  }) {
    n += 1;
    const status = o.status ?? 'DELIVERED';
    const goods = o.goods ?? 10_000;
    await t.prisma.order.create({
      data: {
        storeId: o.store ?? S,
        number: `L756-${n}`,
        source: o.source ?? 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: new Date(o.placed ?? '2026-10-10T04:00:00Z'),
        deliveredAt: status === 'DELIVERED' ? new Date(o.at ?? '2026-10-10T06:00:00Z') : null,
        returnedAt: status === 'RETURNED' ? new Date(o.at ?? '2026-10-10T06:00:00Z') : null,
        archivedAt: o.archived ? new Date() : null,
        customerId: o.customer ?? null,
        phone: o.phone ?? null,
        courierAccountId: o.courier ?? null,
        subtotalMinor: goods,
        discountMinor: 0,
        deliveryChargeMinor: 0,
        totalMinor: goods,
        paymentMethod: o.pay === undefined ? 'COD' : o.pay,
        idempotencyKey: `l756-${n}`,
      },
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-geo-slices');
    [S, O] = await seedSampleStores(t.prisma);
    courierA = (await t.prisma.courierAccount.create({ data: { storeId: S, providerKey: 'mock', name: 'Courier A', enabled: true } })).id;
    courierB = (await t.prisma.courierAccount.create({ data: { storeId: S, providerKey: 'mock', name: 'Courier B', enabled: true } })).id;
    ann = (await t.prisma.customer.create({ data: { storeId: S, name: 'Ann Sample' } })).id;
    bob = (await t.prisma.customer.create({ data: { storeId: S, name: 'Bob Sample' } })).id;
    // Ann: an earlier order on 1 Oct, then two on 10 Oct (the second one is a repeat of the first)
    await order({ customer: ann, placed: '2026-10-01T04:00:00Z', at: '2026-10-02T06:00:00Z', courier: courierA });
    await order({ customer: ann, pay: 'BKASH', courier: courierA });
    await order({ customer: ann, source: 'PHONE', courier: courierB, status: 'RETURNED' });
    // Bob: new, website, COD, no courier yet
    await order({ customer: bob, status: 'PLACED' });
    // a guest by phone: two orders, the later one is a repeat
    await order({ phone: '01700000001', placed: '2026-10-09T04:00:00Z', at: '2026-10-09T06:00:00Z', source: 'WHATSAPP' });
    await order({ phone: '01700000001', source: 'WHATSAPP', pay: 'BKASH' });
    // nobody to tell by, paid over the counter
    await order({ pay: 'CASH', source: 'PHONE' });
    // a cancelled earlier order does not make a repeat
    await order({ customer: bob, status: 'CANCELLED', placed: '2026-10-02T04:00:00Z' });
    // never read
    await order({ archived: true });
    await order({ store: O });
  });
  afterAll(async () => t?.drop());

  const days = { from: '2026-10-10', to: '2026-10-10' };
  const by = (dimension: (typeof SLICE_DIMENSIONS)[number], slices = {}) => geoSliceBreakdown(t.prisma, { storeId: S, timeZone: TZ, days, dimension, slices, includeMoney: true });

  it('by channel: orders placed, delivered, returned and the goods; the parts add up', async () => {
    const r = await by('channel');
    const get = (k: string) => r.buckets.find((b) => b.key === k);
    expect(get('WEBSITE')).toMatchObject({ orders: 2, delivered: 1, returned: 0, salesMinor: 10_000 });
    expect(get('PHONE')).toMatchObject({ orders: 2, delivered: 1, returned: 1 });
    expect(get('WHATSAPP')).toMatchObject({ orders: 1, delivered: 1 });
    expect(r.total).toEqual(sumBuckets(r.buckets));
  });

  it('every dimension adds up to the same whole', async () => {
    const whole = (await by('channel')).total;
    for (const d of SLICE_DIMENSIONS) expect((await by(d)).total).toEqual(whole);
  });

  it('a cut by another slice narrows every part; the parts still add up to that narrower whole', async () => {
    const all = (await by('paymentType')).total;
    const phone = await by('paymentType', { channel: 'PHONE' });
    expect(phone.total.orders).toBe(2);
    expect(phone.total.orders).toBeLessThan(all.orders);
    expect(phone.total).toEqual(sumBuckets(phone.buckets));
    const cod = await by('channel', { paymentType: 'COD' });
    expect(cod.buckets.every((b) => b.orders > 0)).toBe(true);
    expect(cod.total.orders).toBe(2);
  });

  it('payment: cash over the counter is its own bucket, not COD and not online', async () => {
    const r = await by('paymentType');
    expect(r.buckets.find((b) => b.key === 'OTHER')?.orders).toBe(1);
    expect(r.buckets.find((b) => b.key === 'ONLINE')?.orders).toBe(2);
  });

  it('courier: an order with no parcel is UNKNOWN, counted apart', async () => {
    const r = await by('courier');
    expect(r.buckets.find((b) => b.key === courierA)?.orders).toBe(1);
    expect(r.buckets.find((b) => b.key === courierB)?.orders).toBe(1);
    expect(r.buckets.find((b) => b.key === UNKNOWN_BUCKET)?.orders).toBe(3);
    expect((await by('channel', { courierId: courierA })).total.orders).toBe(1);
  });

  it('customer type: earlier non-cancelled orders of the customer or, for a guest, the phone make a repeat', async () => {
    const r = await by('customerType');
    const get = (k: string) => r.buckets.find((b) => b.key === k)?.orders ?? 0;
    // Ann's two orders on 10 Oct are both repeats (she has the 1 Oct order), the phone guest's 10 Oct order is a repeat,
    // Bob is new (his earlier order is cancelled), the counter sale has nobody to tell by
    expect(get('REPEAT')).toBe(3);
    expect(get('NEW')).toBe(1);
    expect(get(UNKNOWN_BUCKET)).toBe(1);
  });

  it('without money rights the goods are not given', async () => {
    const r = await geoSliceBreakdown(t.prisma, { storeId: S, timeZone: TZ, days, dimension: 'channel', includeMoney: false });
    expect(r.buckets.every((b) => b.salesMinor === null)).toBe(true);
    expect(r.total.salesMinor).toBeNull();
  });
});
