// S29 · PR 756 — the slices of the Geography map without a database: what an address and a saved mix may carry, which
// slices the setting shows, the bucket an order falls in for each dimension, that the parts add up to the whole with an
// unknown bucket apart, and the SQL fragment each slice adds (never the customer's name or phone).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHANNELS,
  ONLINE_METHODS,
  ORDER_SLICE_KEYS,
  SLICE_DIMENSIONS,
  SLICE_KEYS,
  UNKNOWN_BUCKET,
  allowedSlices,
  classify,
  normalizeSlices,
  orderSliceSql,
  shownSlices,
  sliceCount,
  slicesFromSearch,
  slicesToParams,
  sumBuckets,
  type SliceBucket,
  type SliceFacts,
} from './geo-slices';

const ID = '0195f0a2-7c1e-7a55-9b6e-0e6f6d0c1a2b';
const facts = (o: Partial<SliceFacts> = {}): SliceFacts => ({ source: 'WEBSITE', paymentMethod: 'COD', courierAccountId: null, customerKnown: true, hasEarlierOrder: false, ...o });

describe('what a mix may carry', () => {
  it('keeps real values and drops everything else, never throwing', () => {
    expect(normalizeSlices({ channel: 'PHONE', paymentType: 'COD', courierId: ID, customerType: 'REPEAT', categoryId: ID, productId: ID })).toEqual({
      channel: 'PHONE', paymentType: 'COD', courierId: ID, customerType: 'REPEAT', categoryId: ID, productId: ID,
    });
    expect(normalizeSlices({ channel: 'FAX', paymentType: 'CASH', courierId: 'x', customerType: 'VIP', categoryId: 5 })).toEqual({});
    expect(normalizeSlices(null)).toEqual({});
    expect(normalizeSlices('PHONE')).toEqual({});
  });
  it('reads the address and writes it back the same', () => {
    const s = slicesFromSearch({ channel: 'WHATSAPP', pay: 'ONLINE', courier: ID, cust: 'NEW', cat: ID, product: ID });
    expect(s).toEqual({ channel: 'WHATSAPP', paymentType: 'ONLINE', courierId: ID, customerType: 'NEW', categoryId: ID, productId: ID });
    expect(slicesFromSearch(slicesToParams(s))).toEqual(s);
    expect(slicesToParams({})).toEqual({});
    expect(sliceCount(s)).toBe(6);
    expect(sliceCount({})).toBe(0);
    expect(slicesFromSearch({ pay: ['ONLINE', 'COD'] }).paymentType).toBe('ONLINE');
  });
  it('lists every slice once, order-level ones among them', () => {
    expect(new Set(SLICE_KEYS).size).toBe(SLICE_KEYS.length);
    for (const k of ORDER_SLICE_KEYS) expect(SLICE_KEYS).toContain(k);
  });
});

describe("which slices show (all of them: no switch)", () => {
  it("every slice shows", () => {
    expect(shownSlices()).toEqual([...SLICE_KEYS]);
  });
  it("a value that is not a known slice value is dropped, never an error", () => {
    expect(allowedSlices({ channel: "PHONE", paymentType: "COD" })).toEqual({
      channel: "PHONE",
      paymentType: "COD",
    });
    expect(allowedSlices({ channel: "NOT-A-CHANNEL" as never })).toEqual({});
  });
});

describe('the bucket of an order, for each dimension', () => {
  it('channel is the order source', () => {
    expect(classify('channel', facts({ source: 'PHONE' }))).toBe('PHONE');
  });
  it('payment: COD or none yet is COD, an online method is ONLINE, cash over the counter is OTHER', () => {
    expect(classify('paymentType', facts({ paymentMethod: 'COD' }))).toBe('COD');
    expect(classify('paymentType', facts({ paymentMethod: null }))).toBe('COD');
    for (const m of ONLINE_METHODS) expect(classify('paymentType', facts({ paymentMethod: m }))).toBe('ONLINE');
    expect(classify('paymentType', facts({ paymentMethod: 'CASH' }))).toBe('OTHER');
  });
  it('courier: the parcel courier, or UNKNOWN when none is booked', () => {
    expect(classify('courier', facts({ courierAccountId: ID }))).toBe(ID);
    expect(classify('courier', facts())).toBe(UNKNOWN_BUCKET);
  });
  it('customer type: REPEAT with an earlier order, NEW without, UNKNOWN when there is nobody to tell by', () => {
    expect(classify('customerType', facts({ hasEarlierOrder: true }))).toBe('REPEAT');
    expect(classify('customerType', facts())).toBe('NEW');
    expect(classify('customerType', facts({ customerKnown: false, hasEarlierOrder: true }))).toBe(UNKNOWN_BUCKET);
  });
  it('the payment lists are disjoint and the channel list is the schema', () => {
    expect(ONLINE_METHODS).not.toContain('COD');
    expect(ONLINE_METHODS).not.toContain('CASH');
    const schema = readFileSync(join(__dirname, '../../db/prisma/schema.prisma'), 'utf8');
    const enumText = /enum OrderSource \{([^}]*)\}/.exec(schema)?.[1] ?? '';
    expect(enumText.split(/\s+/).filter(Boolean).sort()).toEqual([...CHANNELS].sort());
    const pay = /enum PaymentMethod \{([^}]*)\}/.exec(schema)?.[1] ?? '';
    expect(pay.split(/\s+/).filter(Boolean).sort()).toEqual(['COD', 'CASH', ...ONLINE_METHODS].sort());
  });
});

describe('every mix adds up to the whole, an unknown value counted apart', () => {
  // a small shop of orders: whatever dimension we cut by, the parts equal the number of orders
  const shop: SliceFacts[] = [
    facts({ source: 'WEBSITE', paymentMethod: 'COD', courierAccountId: ID, hasEarlierOrder: false }),
    facts({ source: 'WEBSITE', paymentMethod: 'BKASH', courierAccountId: ID, hasEarlierOrder: true }),
    facts({ source: 'PHONE', paymentMethod: null, courierAccountId: null, hasEarlierOrder: false }),
    facts({ source: 'SHOWROOM', paymentMethod: 'CASH', courierAccountId: null, customerKnown: false }),
    facts({ source: 'WHATSAPP', paymentMethod: 'NAGAD', courierAccountId: '0195f0a2-7c1e-7a55-9b6e-0e6f6d0c1a2c', hasEarlierOrder: true }),
  ];
  it.each(SLICE_DIMENSIONS)('by %s', (dimension) => {
    const buckets = new Map<string, number>();
    for (const o of shop) buckets.set(classify(dimension, o), (buckets.get(classify(dimension, o)) ?? 0) + 1);
    expect([...buckets.values()].reduce((a, b) => a + b, 0)).toBe(shop.length);
  });
  it('shows the unknowns apart', () => {
    const byCourier = new Map<string, number>();
    for (const o of shop) byCourier.set(classify('courier', o), (byCourier.get(classify('courier', o)) ?? 0) + 1);
    expect(byCourier.get(UNKNOWN_BUCKET)).toBe(2);
    const byCustomer = new Map<string, number>();
    for (const o of shop) byCustomer.set(classify('customerType', o), (byCustomer.get(classify('customerType', o)) ?? 0) + 1);
    expect(byCustomer.get(UNKNOWN_BUCKET)).toBe(1);
  });
  it('sumBuckets adds orders, delivered and returned, and money only when every part has it', () => {
    const b = (key: string, orders: number, delivered: number, returned: number, salesMinor: number | null): SliceBucket => ({ key, orders, delivered, returned, salesMinor });
    expect(sumBuckets([b('A', 3, 2, 1, 500), b(UNKNOWN_BUCKET, 2, 1, 0, 200)])).toEqual({ orders: 5, delivered: 3, returned: 1, salesMinor: 700 });
    expect(sumBuckets([b('A', 3, 2, 1, null), b('B', 1, 1, 0, null)]).salesMinor).toBeNull();
    expect(sumBuckets([])).toEqual({ orders: 0, delivered: 0, returned: 0, salesMinor: 0 });
  });
});

describe('the SQL a slice adds', () => {
  it('nothing for no slice, and no category or product (those narrow lines, not orders)', () => {
    expect(orderSliceSql({}).sql).toBe('');
    expect(orderSliceSql({ categoryId: ID, productId: ID }).sql).toBe('');
  });
  it('one AND part per order-level slice, values as parameters, never as text', () => {
    const q = orderSliceSql({ channel: 'PHONE', paymentType: 'COD', courierId: ID, customerType: 'NEW' });
    expect(q.sql.startsWith(' AND ')).toBe(true);
    expect(q.sql).toContain('o."source"::text = ?');
    expect(q.sql).toContain('o."courierAccountId" =');
    expect(q.sql).toContain('EXISTS');
    expect(q.sql).not.toContain('PHONE');
    expect(q.sql).not.toContain(ID);
    expect(q.values).toContain('PHONE');
    expect(q.values).toContain(ID);
  });
  it('never reads a name, a phone number as a figure, or an address', () => {
    const q = orderSliceSql({ customerType: 'REPEAT' });
    expect(q.sql).not.toMatch(/customerName|"email"|shippingAddressText/);
  });
});
