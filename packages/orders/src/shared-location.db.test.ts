// S06 · PR 159 follow-up 324: the shared location as the team may use it — while the order still keeps it, never a gift,
// never past its keep date, and only while the owner turned the order page's part on. The db part runs on a real
// PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL). Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { sharedLocationSettings } from '@extas/settings';
import { mapLinkOf, orderPageLocation, sharedPointOf } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

const NOW = new Date('2026-11-01T06:00:00Z');
const LATER = new Date('2027-04-30T06:00:00Z');

describe('follow-up 324 · the shared point, pure', () => {
  it('the stored rounded point while it is kept; none when cleared, past its keep date, a gift or out of range', () => {
    expect(sharedPointOf({ gpsLat: '23.781000', gpsLng: '90.412000', piiExpiresAt: LATER }, NOW)).toEqual({ lat: '23.781', lng: '90.412', text: '23.781, 90.412' });
    expect(sharedPointOf({ gpsLat: 23.7815, gpsLng: 90.4125, piiExpiresAt: null }, NOW)?.text).toBe('23.7815, 90.4125');
    expect(sharedPointOf({ gpsLat: null, gpsLng: null, piiExpiresAt: LATER }, NOW)).toBeNull();
    expect(sharedPointOf({ gpsLat: '23.781', gpsLng: null, piiExpiresAt: LATER }, NOW)).toBeNull();
    expect(sharedPointOf({ gpsLat: '23.781', gpsLng: '90.412', piiExpiresAt: NOW }, NOW)).toBeNull();
    expect(sharedPointOf({ gpsLat: '23.781', gpsLng: '90.412', piiExpiresAt: LATER, isGift: true }, NOW)).toBeNull();
    expect(sharedPointOf({ gpsLat: '123.5', gpsLng: '90.412', piiExpiresAt: LATER }, NOW)).toBeNull();
  });

  it('the owner\'s map address with the point filled in, every {lat} and {lng}', () => {
    const p = sharedPointOf({ gpsLat: '-1.5', gpsLng: '90.412', piiExpiresAt: null }, NOW)!;
    expect(mapLinkOf('https://maps.example.org/?q={lat},{lng}&m={lat}/{lng}', p)).toBe('https://maps.example.org/?q=-1.5,90.412&m=-1.5/90.412');
    expect(mapLinkOf(sharedLocationSettings['orders.sharedLocation'].default.mapLink, p)).toMatch(/^https:\/\/.*-1\.5.*90\.412/);
  });
});

describe.skipIf(!HAS_TEST_DB)('follow-up 324 · the order page\'s map link (PostgreSQL)', () => {
  let f: OrdersFixture;
  const set = (v: Partial<{ orderPage: boolean; sticker: boolean; mapLink: string }>) => f.overrides.set('orders.sharedLocation', { ...sharedLocationSettings['orders.sharedLocation'].default, ...v });

  beforeAll(async () => {
    f = await setUpOrders('shared-location');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off as shipped; on, the link while the order keeps the point, and nothing once the purge cleared it', async () => {
    const o = await f.place('sl-1', { phone: '01700000324' });
    await f.t.prisma.order.update({ where: { id: o.orderId }, data: { gpsLat: '23.781', gpsLng: '90.412', piiExpiresAt: new Date(Date.now() + 86_400_000) } });
    const deps = f.ordersDeps();
    expect(await orderPageLocation(deps, f.S, o.orderId)).toBeNull();
    set({ orderPage: true, mapLink: 'https://maps.example.org/?q={lat},{lng}' });
    expect(await orderPageLocation(deps, f.S, o.orderId)).toEqual({ lat: '23.781', lng: '90.412', text: '23.781, 90.412', href: 'https://maps.example.org/?q=23.781,90.412' });
    // another store never reads it
    expect(await orderPageLocation(deps, f.S + 1, o.orderId)).toBeNull();
    await f.t.prisma.order.update({ where: { id: o.orderId }, data: { gpsLat: null, gpsLng: null, piiExpiresAt: null } });
    expect(await orderPageLocation(deps, f.S, o.orderId)).toBeNull();
  });
});
