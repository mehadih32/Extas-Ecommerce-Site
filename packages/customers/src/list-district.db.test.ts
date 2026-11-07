// PR 285 follow-up 473 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): the Customers list's district filter — a person is in a district when his latest order with a
// resolved place is in it (the place itself, or an upazila under it); the filter's choices are the districts the store's
// orders reached. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customerList } from './list';
import { setUpCustomers, type CustomersFixture } from './testing';

// hardcode-ok: made-up test numbers
const N = { a: '+8801700004731', b: '+8801700004732', c: '+8801700004733' };

describe.skipIf(!process.env.TEST_DATABASE_ADMIN_URL)('the Customers list by district (PR 285, follow-up 473)', () => {
  let f: CustomersFixture;
  const ids: Record<string, string> = {};
  const geo: Record<string, string> = {};
  let n = 0;

  async function order(customerId: string, phone: string, status: 'PLACED' | 'RETURNED', areaId: string | null, daysAgo: number) {
    n += 1;
    const placed = new Date(f.clock.now.getTime() - daysAgo * 86_400_000);
    await f.t.prisma.order.create({
      data: { storeId: f.S, number: `D473-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: placed, subtotalMinor: 1_000, discountMinor: 0, deliveryChargeMinor: 0, totalMinor: 1_000, paymentMethod: 'COD', customerId, phone, areaId, idempotencyKey: `d473-${n}` },
    });
  }

  beforeAll(async () => {
    f = await setUpCustomers('customers-district');
    const p = f.t.prisma;
    await p.customer.updateMany({ where: { storeId: f.S }, data: { archivedAt: f.clock.now } });
    geo.bogura = (await p.geoArea.create({ data: { level: 'DISTRICT', code: 'test473.bogura', nameEn: 'Bogura', nameBn: 'বগুড়া' } })).id;
    geo.gabtali = (await p.geoArea.create({ data: { level: 'UPAZILA', code: 'test473.gabtali', nameEn: 'Gabtali', nameBn: 'গাবতলী', parentId: geo.bogura, ancestorIds: [geo.bogura] } })).id;
    geo.sylhet = (await p.geoArea.create({ data: { level: 'DISTRICT', code: 'test473.sylhet', nameEn: 'Sylhet', nameBn: 'সিলেট' } })).id;
    geo.unused = (await p.geoArea.create({ data: { level: 'DISTRICT', code: 'test473.unused', nameEn: 'Unused', nameBn: 'অব্যবহৃত' } })).id;
    ids.a = await f.profile({ phone: N.a, name: 'Karim' });
    ids.b = await f.profile({ phone: N.b, name: 'Sumon' });
    ids.c = await f.profile({ phone: N.c, name: 'Abul' });
    // Karim moved: an older order to Sylhet, his latest to Gabtali (Bogura); his newest has no resolved place yet
    await order(ids.a!, N.a, 'RETURNED', geo.sylhet, 30);
    await order(ids.a!, N.a, 'PLACED', geo.gabtali, 5);
    await order(ids.a!, N.a, 'PLACED', null, 1);
    await order(ids.b!, N.b, 'PLACED', geo.sylhet, 2);
  });
  afterAll(async () => f?.t.drop());

  const list = (input: Record<string, unknown> = {}) => customerList(f.customersDeps(), f.manager, input);

  it('a person is in the district of his latest order with a resolved place (an upazila counts for its district)', async () => {
    expect((await list({ district: geo.bogura })).rows.map((r) => r.id)).toEqual([ids.a]);
    expect((await list({ district: geo.sylhet })).rows.map((r) => r.id)).toEqual([ids.b]);
    expect((await list({ district: geo.unused })).rows).toEqual([]);
    const all = await list();
    expect(all.rows.map((r) => r.id).sort()).toEqual([ids.a, ids.b, ids.c].sort());
    expect(all.query.district).toBe('');
    const l = await list({ district: geo.bogura });
    expect(l.query.district).toBe(geo.bogura);
    expect(l.counts.all).toBe(1);
  });

  it('the choices are the districts the store’s orders reached, by name, in both languages', async () => {
    const { districts } = await list();
    expect(districts).toEqual([
      { id: geo.bogura, nameEn: 'Bogura', nameBn: 'বগুড়া' },
      { id: geo.sylhet, nameEn: 'Sylhet', nameBn: 'সিলেট' },
    ]);
  });

  it('a district that is not an id is refused, not searched', async () => {
    await expect(list({ district: 'bogura' })).rejects.toThrow();
  });
});
