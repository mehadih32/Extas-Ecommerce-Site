// S29 · PR 757 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL; NOT run in the lane that wrote it, which had
// no database): the courier and coverage lens — success from delivered and returned parcels on their own days, delivery
// hours against the band's promise, practice (MOCK) parcels and exchange legs and archived or other stores' orders never
// counted, an enabled courier's live mapping covering the place and the places under it, an archived mapping or a
// disabled courier covering nothing. Made-up values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { courierLens, type CourierLensThresholds } from './geo-courier';

const TZ = 'Asia/Dhaka';
const TH: CourierLensThresholds = { minParcels: 2, lowSuccessPct: 70, lateWarnPct: 30, gapLimit: 10 };

describe.skipIf(!HAS_TEST_DB)('PR 757 · courier and coverage lens on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const g: Record<string, string> = {};
  const c: Record<string, string> = {};
  let band48 = '';

  async function place(key: string, level: 'DIVISION' | 'DISTRICT' | 'UPAZILA' | 'THANA' | 'AREA', nameEn: string, parent: string | null, extra: { cityCorporation?: string } = {}) {
    const up = parent ? await t.prisma.geoArea.findUniqueOrThrow({ where: { id: g[parent]! } }) : null;
    g[key] = (await t.prisma.geoArea.create({ data: { level, nameEn, code: `test757.${key}`, parentId: up?.id ?? null, ancestorIds: up ? [...up.ancestorIds, up.id] : [], aliases: [], postcodes: [], ...extra } })).id;
  }

  async function parcel(o: {
    area: string | null;
    courier: string;
    status: 'DELIVERED' | 'RETURNED';
    pickedHoursBefore?: number;
    band?: string | null;
    mode?: 'MOCK' | 'LIVE';
    exchange?: boolean;
    archived?: boolean;
    store?: number;
    at?: string;
  }) {
    n += 1;
    const storeId = o.store ?? S;
    const at = new Date(o.at ?? '2026-10-10T06:00:00Z');
    const order = await t.prisma.order.create({
      data: {
        storeId,
        number: `L757-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status: o.status,
        placedAt: new Date('2026-10-10T04:00:00Z'),
        deliveredAt: o.status === 'DELIVERED' ? at : null,
        returnedAt: o.status === 'RETURNED' ? at : null,
        archivedAt: o.archived ? new Date() : null,
        areaId: o.area ? g[o.area]! : null,
        deliveryBandId: o.band === undefined ? null : o.band,
        subtotalMinor: 10_000,
        totalMinor: 10_000,
        paymentMethod: 'COD',
        idempotencyKey: `l757-${n}`,
      },
    });
    await t.prisma.shipment.create({
      data: {
        storeId,
        orderId: order.id,
        courierAccountId: c[o.courier]!,
        status: o.status,
        pickedAt: new Date(at.getTime() - (o.pickedHoursBefore ?? 24) * 3_600_000),
        deliveredAt: o.status === 'DELIVERED' ? at : null,
        returnedAt: o.status === 'RETURNED' ? at : null,
        mode: o.mode ?? 'LIVE',
        isExchangeLeg: o.exchange ?? false,
        idempotencyKey: `s757-${n}`,
      },
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-geo-courier');
    [S, O] = await seedSampleStores(t.prisma);
    await place('dhkDiv', 'DIVISION', 'Dhaka', null);
    await place('dhk', 'DISTRICT', 'Dhaka', 'dhkDiv');
    await place('mirpur', 'THANA', 'Mirpur', 'dhk', { cityCorporation: 'DNCC' });
    await place('savar', 'UPAZILA', 'Savar', 'dhk');
    await place('rajDiv', 'DIVISION', 'Rajshahi', null);
    await place('bogura', 'DISTRICT', 'Bogura', 'rajDiv');
    await place('gabtali', 'UPAZILA', 'Gabtali', 'bogura');
    for (const key of ['A', 'B', 'OFF']) c[key] = (await t.prisma.courierAccount.create({ data: { storeId: S, providerKey: 'mock', name: `Courier ${key}`, enabled: key !== 'OFF' } })).id;
    band48 = (await t.prisma.deliveryBand.create({ data: { storeId: S, key: 'rest', nameEn: 'Rest of Bangladesh', chargeMinor: 12_000, hoursMax: 48, enabled: true } })).id;
    // Courier A: 3 delivered at Savar (two within 48 h, one 72 h), 1 returned; Courier B: 2 delivered, 2 returned at Savar
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', pickedHoursBefore: 24, band: band48 });
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', pickedHoursBefore: 40, band: band48 });
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', pickedHoursBefore: 72, band: band48 });
    await parcel({ area: 'savar', courier: 'A', status: 'RETURNED' });
    await parcel({ area: 'savar', courier: 'B', status: 'DELIVERED' });
    await parcel({ area: 'savar', courier: 'B', status: 'DELIVERED' });
    await parcel({ area: 'savar', courier: 'B', status: 'RETURNED' });
    await parcel({ area: 'savar', courier: 'B', status: 'RETURNED' });
    // never counted
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', mode: 'MOCK' });
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', exchange: true });
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', archived: true });
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', store: O });
    await parcel({ area: 'savar', courier: 'A', status: 'DELIVERED', at: '2026-10-25T06:00:00Z' }); // outside the period
    // Gabtali has orders and a parcel, but no courier is mapped there
    await parcel({ area: 'gabtali', courier: 'B', status: 'DELIVERED' });
    // Mirpur is mapped by an enabled courier (covers the places under it); Savar only by a disabled courier and an archived mapping
    await t.prisma.courierAreaMapping.create({ data: { storeId: S, courierAccountId: c.A!, areaId: g.mirpur! } });
    await t.prisma.courierAreaMapping.create({ data: { storeId: S, courierAccountId: c.OFF!, areaId: g.savar! } });
    await t.prisma.courierAreaMapping.create({ data: { storeId: S, courierAccountId: c.B!, areaId: g.savar!, archivedAt: new Date(), archivedReason: 'courierDropped' } });
  });
  afterAll(async () => t?.drop());

  const days = { from: '2026-10-10', to: '2026-10-12' };
  const lens = (level: 'district' | 'upazila' | 'division' | 'area' = 'district', parentAreaId: string | null = null) => courierLens(t.prisma, { storeId: S, timeZone: TZ, days, level, parentAreaId, thresholds: TH });

  it('success and counts per district; practice, exchange legs, archived, other stores and other days are left out', async () => {
    const r = await lens();
    const dhk = r.rows.find((x) => x.areaId === g.dhk)!;
    expect(dhk.figures).toMatchObject({ delivered: 5, returned: 3, parcels: 8, couriersUsed: 2 });
    expect(dhk.figures.courierSuccessRate).toBeCloseTo(5 / 8);
  });

  it('the hours against the promise: only parcels whose band promised count toward late', async () => {
    const dhk = (await lens()).rows.find((x) => x.areaId === g.dhk)!;
    expect(dhk.figures.promiseHours).toBe(48);
    expect(dhk.figures.lateShare).toBeCloseTo(1 / 3);
    expect(dhk.flags).toContain('late');
  });

  it('the best courier is the better success rate among couriers with enough parcels (advice only)', async () => {
    const r = await lens();
    expect(r.details[g.dhk!]!.best).toMatchObject({ courierId: c.A, parcels: 4 });
    expect(r.details[g.dhk!]!.best?.successRate).toBeCloseTo(3 / 4);
    expect(r.couriers.map((x) => x.name).sort()).toEqual(['Courier A', 'Courier B']);
  });

  it('coverage: a mapping above covers, a disabled courier or an archived mapping covers nothing', async () => {
    const r = await lens('upazila');
    expect(r.gaps.map((x) => x.areaId)).toContain(g.savar);
    expect(r.gaps.map((x) => x.areaId)).toContain(g.gabtali);
    expect(r.rows.find((x) => x.areaId === g.savar)!.flags).toContain('coverageGap');
  });

  it('a parent keeps only the places under it', async () => {
    const r = await lens('upazila', g.rajDiv!);
    expect(r.rows.map((x) => x.areaId)).toEqual([g.gabtali]);
  });
});
