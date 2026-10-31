// SIM-F-048 · PR 550 follow-up on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the delivery promise per
// district. Off as shipped: a settled line keeps its band's hours. On with a row for the line's district: the line's
// band carries that district's hours (the checkout's promise); another district keeps the band's. The district of a
// gazetteer place is read for the order pages (itself, or the district above it). Charges never change.
// Review R3 (customer M2/M3): the one promise clock every "late" reads — the district's hours, counted from the first
// day back for an order placed in the holiday break, none for "may arrive after Eid".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { districtHours, districtPromises, orderPromises, promiseDueBy, quoteLine, resolveLine, zonedMidnight } from '../src';
import { registry } from '@extas/settings';
import { setUp, type Fixture } from './fixture';

describe.skipIf(!HAS_TEST_DB)('the delivery promise per district on PostgreSQL (SIM-F-048)', () => {
  let f: Fixture;
  let bogura = '';

  beforeAll(async () => {
    f = await setUp('delivery_promise');
    await f.t.prisma.deliveryBand.update({ where: { id: await f.band('outside-dhaka') }, data: { enabled: true, chargeMinor: 13000, hoursMin: 48, hoursMax: 72 } });
    const d = await f.t.prisma.geoArea.findFirstOrThrow({ where: { level: 'DISTRICT', nameEn: 'Bogura' }, select: { code: true } });
    bogura = d.code!;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('pure: off, no district or no row keeps the band; a row gives its own hours', () => {
    const band = { key: 'b', hoursMin: 48, hoursMax: 72 };
    const rows = [{ district: 'X', hoursMin: 96, hoursMax: 144 }];
    expect(districtHours({ enabled: false, rows }, 'X', band)).toBe(band);
    expect(districtHours({ enabled: true, rows }, null, band)).toBe(band);
    expect(districtHours({ enabled: true, rows }, 'Y', band)).toBe(band);
    expect(districtHours({ enabled: true, rows }, 'X', band)).toEqual({ key: 'b', hoursMin: 96, hoursMax: 144 });
  });

  it('off as shipped: the line keeps its band hours', async () => {
    const q = await quoteLine(f.deps(), f.A, { line: 'Masterpara, Gabtali, Bogura' });
    expect(q.read.status === 'resolved' && q.read.band).toMatchObject({ hoursMin: 48, hoursMax: 72 });
    expect((await districtPromises(f.deps(), f.A, ['any'])).districtOf.size).toBe(0);
  });

  it("on: the district's own hours on the checkout's read and the resolver; the charge stays the band's", async () => {
    f.overrides.set('delivery.promise.districts', { enabled: true, rows: [{ district: bogura, hoursMin: 96, hoursMax: 144 }] });
    const q = await quoteLine(f.deps(), f.A, { line: 'Masterpara, Gabtali, Bogura' });
    expect(q.status).toBe('resolved');
    expect(q.read.status === 'resolved' && q.read.band).toMatchObject({ key: 'outside-dhaka', chargeMinor: 13000, hoursMin: 96, hoursMax: 144 });
    expect(q.status === 'resolved' && q.quote).toMatchObject({ kind: 'charge', chargeMinor: 13000 });
    const r = await resolveLine(f.deps(), f.A, { line: 'Masterpara, Gabtali, Bogura' });
    expect(r.status === 'resolved' && r.band).toMatchObject({ hoursMin: 96, hoursMax: 144 });
    // the order pages: the district of the place and of the district itself
    const area = q.status === 'resolved' && q.read.status === 'resolved' ? q.read.area!.id : '';
    const district = await f.t.prisma.geoArea.findFirstOrThrow({ where: { code: bogura }, select: { id: true } });
    const p = await districtPromises(f.deps(), f.A, [area, district.id, null]);
    expect(p.districtOf.get(area)).toBe(bogura);
    expect(p.districtOf.get(district.id)).toBe(bogura);
    // a district with no row keeps its band
    f.overrides.set('delivery.promise.districts', { enabled: true, rows: [{ district: 'NO-SUCH', hoursMin: null, hoursMax: 200 }] });
    const other = await quoteLine(f.deps(), f.A, { line: 'Masterpara, Gabtali, Bogura' });
    expect(other.read.status === 'resolved' && other.read.band).toMatchObject({ hoursMin: 48, hoursMax: 72 });
    f.overrides.delete('delivery.promise.districts');
  });

  it('R3: the one promise clock — district hours, the holiday break, Eid', async () => {
    const area = (await f.t.prisma.geoArea.findFirstOrThrow({ where: { code: bogura }, select: { id: true } })).id;
    const band = { key: 'outside-dhaka', hoursMin: 48, hoursMax: 72 };
    const placedAt = new Date('2027-02-01T06:00:00Z'); // hardcode-ok: a made-up test day
    const one = async (at: Date) => (await orderPromises(f.deps(), f.A, [{ id: 'o', placedAt: at, areaId: area, band }])).get('o')!;
    // off: the band's hours from the placing
    expect(promiseDueBy(await one(placedAt))).toEqual(new Date(placedAt.getTime() + 72 * 3_600_000));
    // a district at 120 h: due at 120 h, so not late at 80 h
    f.overrides.set('delivery.promise.districts', { enabled: true, rows: [{ district: bogura, hoursMin: 72, hoursMax: 120 }] });
    try {
      const due = promiseDueBy(await one(placedAt))!;
      expect(due).toEqual(new Date(placedAt.getTime() + 120 * 3_600_000));
      expect(due.getTime()).toBeGreaterThan(placedAt.getTime() + 80 * 3_600_000);
    } finally {
      f.overrides.delete('delivery.promise.districts');
    }
    // placed during the holiday break: the hours count from the first day back (midnight, store time)
    f.overrides.set('delivery.holiday', { ...registry['delivery.holiday'].default, enabled: true, from: '2027-04-08', to: '2027-04-11' });
    try {
      const p = await one(new Date('2027-04-09T06:00:00Z'));
      expect(p.from).toEqual(zonedMidnight('2027-04-12', 'Asia/Dhaka'));
      expect(p.from).toEqual(new Date('2027-04-11T18:00:00Z'));
      expect((await one(placedAt)).from).toEqual(placedAt);
    } finally {
      f.overrides.delete('delivery.holiday');
    }
    // placed past its place's Eid date: "may arrive after Eid", no hours, never late
    f.overrides.set('rules.eid.enabled', true);
    f.overrides.set('rules.eid.eidDate', '2027-03-20');
    f.overrides.set('rules.eid.bandDates', [{ band: 'outside-dhaka', orderBy: '2027-03-15' }]);
    try {
      const closed = await one(new Date('2027-03-17T06:00:00Z'));
      expect(closed.afterEid).toBe(true);
      expect(promiseDueBy(closed)).toBeNull();
      expect((await one(new Date('2027-03-10T06:00:00Z'))).afterEid).toBe(false);
    } finally {
      for (const k of ['rules.eid.enabled', 'rules.eid.eidDate', 'rules.eid.bandDates']) f.overrides.delete(k);
    }
  });
});
