// S16 · PR 354 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a real parcel the courier has not
// reported a charge for. Off (as shipped) it stays "not known"; on, it is priced from the owner's rate card by the
// order's delivery band and the parcel's weight slab, with the card in force when it was booked (a later price list
// never reprices it), and marked an estimate; "COD fee apart" adds the card's COD fee of that parcel as its own part
// (a card without a COD fee = not known; a courier's own charge has it inside). No card row = still not known. The
// P&L counts the estimated orders. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { codFeeMinor, orderProfits, rateRowFor, type ProfitInputs, type RateRow } from './order-profit';
import { profitAndLoss } from './pnl';

const at = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));
const off: ProfitInputs = { currency: 'BDT', timeZone: 'Asia/Dhaka', packagingMinor: 0, gatewayFee: () => 0, ads: { allocate: false, basis: 'month' } };
const on = (codFee: boolean): ProfitInputs => ({ ...off, courierEstimate: { enabled: true, codFee } });

describe('PR 354 · the rate-card rule', () => {
  const row = (x: Partial<RateRow>): RateRow => ({ courierAccountId: 'a', zoneKey: 'dhaka', weightFromGrams: 0, weightToGrams: 1000, chargeMinor: 6_000, codFeeBps: 100, validFrom: at(1), validTo: null, ...x });
  it('the weight slab, the card in force, never the lightest slab without a weight', () => {
    const cards = [row({}), row({ weightFromGrams: 1001, weightToGrams: 2000, chargeMinor: 8_000 }), row({ chargeMinor: 7_000, validFrom: at(20) })];
    expect(rateRowFor(cards, { courierAccountId: 'a', zoneKey: 'dhaka', weightGrams: 500, at: at(10) })?.chargeMinor).toBe(6_000);
    expect(rateRowFor(cards, { courierAccountId: 'a', zoneKey: 'dhaka', weightGrams: 500, at: at(21) })?.chargeMinor).toBe(7_000);
    expect(rateRowFor(cards, { courierAccountId: 'a', zoneKey: 'dhaka', weightGrams: 1500, at: at(10) })?.chargeMinor).toBe(8_000);
    expect(rateRowFor(cards, { courierAccountId: 'a', zoneKey: 'dhaka', weightGrams: null, at: at(10) })).toBeNull();
    expect(rateRowFor([row({})], { courierAccountId: 'a', zoneKey: 'dhaka', weightGrams: null, at: at(10) })?.chargeMinor).toBe(6_000);
    expect(rateRowFor(cards, { courierAccountId: 'b', zoneKey: 'dhaka', weightGrams: 500, at: at(10) })).toBeNull();
    expect(rateRowFor(cards, { courierAccountId: 'a', zoneKey: null, weightGrams: 500, at: at(10) })).toBeNull();
    expect(codFeeMinor(150_050, 100)).toBe(1_501);
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 354 · courier estimate on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let n = 0;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase('metrics-courier-estimate');
    [S] = await seedSampleStores(t.prisma);
    const band = await t.prisma.deliveryBand.create({ data: { storeId: S, key: 'sample-dhaka', nameEn: 'Sample Dhaka', chargeMinor: 6_000 } });
    const courier = await t.prisma.courierAccount.create({ data: { storeId: S, providerKey: 'sample', name: 'Sample courier' } });
    const card = (x: { from: Date; to?: Date; charge: number; cod: number | null; wFrom?: number; wTo?: number }) =>
      t.prisma.courierRateCard.create({ data: { storeId: S, courierAccountId: courier.id, zoneKey: band.key, weightFromGrams: x.wFrom ?? 0, weightToGrams: x.wTo ?? 1000, chargeMinor: x.charge, codFeeBps: x.cod, validFrom: x.from, validTo: x.to ?? null } });
    await card({ from: at(1), to: at(15), charge: 6_000, cod: 100 });
    await card({ from: at(15), charge: 7_000, cod: null }); // a later price list without a COD fee
    async function order(key: string, x: { band?: boolean; charge: number | null; weight: number | null; booked: Date; cod: number }) {
      n += 1;
      const o = await t.prisma.order.create({
        data: { storeId: S, number: `C354-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: x.booked, deliveredAt: at(20), subtotalMinor: 100_000, deliveryChargeMinor: 6_000, totalMinor: 106_000, paymentMethod: 'COD', deliveryBandId: x.band === false ? null : band.id, idempotencyKey: `c354-${n}` },
      });
      await t.prisma.orderItem.create({ data: { storeId: S, orderId: o.id, sku: 'POLO-M', productName: 'Sample polo', quantity: 1, unitPriceMinor: 100_000, lineTotalMinor: 100_000, unitCostMinor: 50_000 } });
      await t.prisma.shipment.create({ data: { storeId: S, orderId: o.id, courierAccountId: courier.id, consignmentId: `C354-${n}`, chargeMinor: x.charge, codAmountMinor: x.cod, weightGrams: x.weight, mode: 'LIVE', bookedAt: x.booked, idempotencyKey: `c354-s-${n}` } });
      ids[key] = o.id;
    }
    await order('early', { charge: null, weight: 800, booked: at(10), cod: 106_000 });
    await order('late', { charge: null, weight: 800, booked: at(16), cod: 106_000 });
    await order('own', { charge: 6_500, weight: 800, booked: at(10), cod: 106_000 });
    await order('heavy', { charge: null, weight: 5_000, booked: at(10), cod: 106_000 });
    await order('noBand', { band: false, charge: null, weight: 800, booked: at(10), cod: 106_000 });
  });
  afterAll(async () => t?.drop());

  it('off as shipped: a parcel without its charge is not known, and there is no COD fee part', async () => {
    const m = await orderProfits(t.prisma, S, [ids.early!], off);
    expect(m.get(ids.early!)!.parts.courier).toEqual({ minor: null, state: 'missing' });
    expect(m.get(ids.early!)!.parts.codFee.state).toBe('off');
  });

  it('on: priced from the card in force when booked, marked an estimate; no card row stays not known', async () => {
    const m = await orderProfits(t.prisma, S, Object.values(ids), on(false));
    expect(m.get(ids.early!)!.parts.courier).toEqual({ minor: 6_000, state: 'estimated' });
    expect(m.get(ids.early!)!.status).toBe('estimated');
    expect(m.get(ids.late!)!.parts.courier).toEqual({ minor: 7_000, state: 'estimated' });
    expect(m.get(ids.own!)!.parts.courier).toEqual({ minor: 6_500, state: 'known' });
    expect(m.get(ids.heavy!)!.parts.courier.state).toBe('missing');
    expect(m.get(ids.noBand!)!.parts.courier.state).toBe('missing');
    expect(m.get(ids.early!)!.parts.codFee.state).toBe('off');
    expect(m.get(ids.early!)!.profitMinor).toBe(100_000 + 6_000 - 50_000 - 6_000);
  });

  it('COD fee apart: the card’s fee on the COD amount; a card without one is not known; the courier’s own charge has it inside', async () => {
    const m = await orderProfits(t.prisma, S, Object.values(ids), on(true));
    expect(m.get(ids.early!)!.parts.codFee).toEqual({ minor: 1_060, state: 'estimated' });
    expect(m.get(ids.early!)!.profitMinor).toBe(100_000 + 6_000 - 50_000 - 6_000 - 1_060);
    expect(m.get(ids.late!)!.parts.codFee).toEqual({ minor: null, state: 'missing' });
    expect(m.get(ids.own!)!.parts.codFee).toEqual({ minor: 0, state: 'known' });
  });

  it('Profit & loss: estimated orders counted, the COD fee inside the contribution, its gaps counted', async () => {
    const p = await profitAndLoss(t.prisma, S, { from: '2026-10-01', to: '2026-10-31' }, { currency: 'BDT', timeZone: 'Asia/Dhaka', packagingMinor: 0, gatewayFee: () => 0, courierEstimate: { enabled: true, codFee: true } });
    expect(p.estimatedCourier).toBe(2);
    expect(p.parts.courier).toBe(6_000 + 7_000 + 6_500);
    expect(p.parts.codFee).toBe(1_060);
    expect(p.missing).toMatchObject({ courier: 2, codFee: 1 });
    expect(p.contributionMinor).toBe(5 * (100_000 + 6_000 - 50_000) - 6_000 - 7_000 - 6_500 - 1_060);
  });
});
