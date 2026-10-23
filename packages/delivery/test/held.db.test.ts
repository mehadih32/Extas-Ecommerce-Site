// PR 561 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), with SAMPLE customers and orders only: the
// address the shop holds for a number — his default saved address with a place, else (when the owner allows it) his
// latest delivered order, or any order not cancelled or returned; never an erased customer's; never an "address
// unclear" order's. Look-ups count distinct numbers per IP, storing a hash of the number, never the number.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { BACKFILL_LOOKUP_EVENT, heldAddress } from '../src';
import { setUp, type Fixture } from './fixture';

const SAVED = '+8801712000561';
const ORDERED = '+8801812000561';
const IP = '192.0.2.61';

describe.skipIf(!HAS_TEST_DB)('the held address for a number on PostgreSQL (PR 561)', () => {
  let f: Fixture;
  let uttara = '';
  let gabtali = '';
  let n = 0;
  const order = (phone: string, status: string, data: Record<string, unknown> = {}) =>
    f.t.prisma.order.create({
      data: { storeId: f.A, number: `T-561-${++n}`, source: 'WEBSITE', currency: 'BDT', subtotalMinor: 100, totalMinor: 100, idempotencyKey: `held-${n}`, phone, status: status as never, placedAt: new Date(Date.UTC(2026, 9, n)), ...data },
    });

  beforeAll(async () => {
    f = await setUp('delivery_held');
    const db = f.t.prisma;
    uttara = await f.area('bd.dhaka.dhaka.uttara');
    gabtali = await f.area('bd.rajshahi.bogura.gabtali');
    const c = await db.customer.create({ data: { storeId: f.A, phone: SAVED, name: 'Sample Customer' } });
    await db.customerAddress.create({ data: { storeId: f.A, customerId: c.id, name: 'Sample Customer', phone: SAVED, addressLine: 'House 9, Road 4, Uttara', areaId: uttara } });
    await db.customerAddress.create({ data: { storeId: f.A, customerId: c.id, name: 'Sample Customer', phone: SAVED, addressLine: 'Sample Bari, Masterpara, Gabtali', areaId: gabtali, isDefault: true } });
    await order(ORDERED, 'DELIVERED', { areaId: uttara, shippingAddressText: 'Road 12, House 42', backfilledAddress: 'House 42, Road 12, Sector 7, Uttara' });
    await order(ORDERED, 'CONFIRMED', { areaId: gabtali, shippingAddressText: 'Sample Bari, Gabtali' });
    await order(ORDERED, 'CANCELLED', { areaId: gabtali, shippingAddressText: 'Cancelled Bari, Gabtali' });
    await order(ORDERED, 'PLACED', { areaId: null, addressUnclear: true, shippingAddressText: 'somewhere' });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it("the customer's default saved address with a place comes first", async () => {
    expect(await heldAddress(f.deps(), f.A, '01712-000561', { orders: 'delivered', ip: IP })).toEqual({ areaId: gabtali, line: 'Sample Bari, Masterpara, Gabtali', from: 'saved' });
  });

  it("without one: the latest delivered order (its backfilled line first), or any order not cancelled — per the owner's choice", async () => {
    expect(await heldAddress(f.deps(), f.A, '01812000561', { orders: 'delivered', ip: IP })).toEqual({ areaId: uttara, line: 'House 42, Road 12, Sector 7, Uttara', from: 'order' });
    expect(await heldAddress(f.deps(), f.A, '01812000561', { orders: 'placed', ip: IP })).toEqual({ areaId: gabtali, line: 'Sample Bari, Gabtali', from: 'order' });
    expect(await heldAddress(f.deps(), f.A, '01812000561', { orders: 'off', ip: IP })).toBeNull();
    expect(await heldAddress(f.deps(), f.B, '01812000561', { orders: 'placed', ip: IP })).toBeNull();
  });

  it('nothing for an unknown number, a bad one, or an erased customer', async () => {
    expect(await heldAddress(f.deps(), f.A, '01912000561', { orders: 'placed', ip: IP })).toBeNull();
    expect(await heldAddress(f.deps(), f.A, '0121200', { orders: 'placed', ip: IP })).toBeNull();
    const erased = '+8801612000561';
    await f.t.prisma.customer.create({ data: { storeId: f.A, phone: erased, name: 'Erased', erasedAt: new Date() } });
    await order(erased, 'DELIVERED', { areaId: uttara, shippingAddressText: 'House 1, Uttara' });
    expect(await heldAddress(f.deps(), f.A, erased, { orders: 'delivered', ip: IP })).toBeNull();
  });

  it('counts distinct numbers per IP: the same number again is free, a new one past the limit gets nothing; never the number stored', async () => {
    f.overrides.set('delivery.phoneFirst.rateLimit', 2);
    const ip = '198.51.100.61';
    for (let i = 0; i < 4; i++) expect(await heldAddress(f.deps(), f.A, SAVED, { orders: 'off', ip })).not.toBeNull();
    expect(await heldAddress(f.deps(), f.A, ORDERED, { orders: 'delivered', ip })).not.toBeNull();
    expect(await heldAddress(f.deps(), f.A, '01912000562', { orders: 'delivered', ip })).toBeNull();
    expect(await heldAddress(f.deps(), f.A, SAVED, { orders: 'off', ip })).not.toBeNull();
    expect(await heldAddress(f.deps(), f.A, '01912000562', { orders: 'delivered', ip: '198.51.100.62' })).toBeNull(); // unknown anyway
    const rows = await f.t.prisma.securityEvent.findMany({ where: { kind: BACKFILL_LOOKUP_EVENT, details: { path: ['ip'], equals: ip } } });
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows.map((r) => r.details))).not.toMatch(/12000561/);
    f.overrides.delete('delivery.phoneFirst.rateLimit');
  });
});
