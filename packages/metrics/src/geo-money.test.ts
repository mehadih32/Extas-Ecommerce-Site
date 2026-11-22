// S29 · PR 759 — the money and stock lens without a database: the delivery charge against the courier's charge (a parcel
// without its charge is never 0), the margin of the orders whose cost is known, the free-delivery orders, ad spend by
// district (and division; unknown below, and an unknown spend is null, never 0), the styles that sell in each area with the
// area's share, and the parts the viewer may not see.
import { describe, expect, it } from 'vitest';
import { buildMoney, MONEY_PARTS, type MoneyLine, type MoneyOptions, type MoneyOrder, type MoneyPart } from './geo-money';
import { BOGURA, DHAKA, GABTALI, PLACES, RAJ, SHERPUR } from './geo-lens-fixtures';

const DAYS = { from: '2026-10-01', to: '2026-10-31' };
const o = (over: Partial<Pick<MoneyOptions, 'level' | 'parentAreaId' | 'minOrders' | 'topProducts' | 'parts'>> = {}) => ({ level: 'upazila' as const, minOrders: 5, topProducts: 2, parts: new Set<MoneyPart>(MONEY_PARTS), ...over });
let n = 0;
const order = (areaId: string | null, x: Partial<MoneyOrder> = {}): MoneyOrder => ({ id: `o${(n += 1)}`, areaId, goodsMinor: 1000, deliveryChargeMinor: 100, courierMinor: 80, profitMinor: 200, ...x });
const many = (k: number, f: () => MoneyOrder) => Array.from({ length: k }, f);
const rowFor = (r: ReturnType<typeof buildMoney>, id: string) => r.rows.find((x) => x.areaId === id)!;

describe('delivery against the courier', () => {
  const orders = [...many(5, () => order(GABTALI.id, { deliveryChargeMinor: 60, courierMinor: 100 })), ...many(5, () => order(SHERPUR.id))];
  const r = buildMoney(PLACES, orders, [], null, o(), DAYS);

  it('shows the gap and flags where delivery costs more than it brings in', () => {
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ deliveryChargeMinor: 300, courierMinor: 500, deliveryGapMinor: -200 });
    expect(rowFor(r, GABTALI.id).flags).toContain('deliveryEatsProfit');
    expect(rowFor(r, SHERPUR.id).figures.deliveryGapMinor).toBe(100);
    expect(rowFor(r, SHERPUR.id).flags).toEqual([]);
  });
  it('needs minOrders parcels with a known charge before it flags', () => {
    const few = buildMoney(PLACES, many(4, () => order(GABTALI.id, { deliveryChargeMinor: 0, courierMinor: 100 })), [], null, o(), DAYS);
    expect(rowFor(few, GABTALI.id).flags).toEqual([]);
  });
  it('a parcel without its charge stays out of the gap and is counted apart, never as 0', () => {
    const mixed = buildMoney(PLACES, [order(GABTALI.id, { courierMinor: null, deliveryChargeMinor: 100 }), order(GABTALI.id, { deliveryChargeMinor: 100, courierMinor: 120 })], [], null, o(), DAYS);
    expect(rowFor(mixed, GABTALI.id).figures).toMatchObject({ courierKnownOrders: 1, courierUnknownOrders: 1, courierMinor: 120, deliveryGapMinor: -20, deliveryChargeMinor: 200 });
  });
  it('no known courier charge at all means no gap, not 0', () => {
    const none = buildMoney(PLACES, [order(GABTALI.id, { courierMinor: null })], [], null, o(), DAYS);
    expect(rowFor(none, GABTALI.id).figures).toMatchObject({ deliveryGapMinor: null, courierMinor: null });
  });
  it('counts free-delivery orders and the margin of the costed ones only', () => {
    const m = buildMoney(PLACES, [order(GABTALI.id, { deliveryChargeMinor: 0, profitMinor: 300, goodsMinor: 1000 }), order(GABTALI.id, { profitMinor: null, goodsMinor: 5000 })], [], null, o(), DAYS);
    expect(rowFor(m, GABTALI.id).figures).toMatchObject({ freeDeliveryOrders: 1, profitMinor: 300, costedSalesMinor: 1000, marginPct: 30, salesMinor: 6000 });
  });
  it('the parts add up to the total, unknown area apart', () => {
    const t = buildMoney(PLACES, [order(GABTALI.id), order(null), order(SHERPUR.id)], [], null, o(), DAYS);
    expect(t.total.delivered).toBe(3);
    expect(t.unknown.delivered).toBe(1);
  });
});

describe('ad spend by district', () => {
  const orders = [order(GABTALI.id, { goodsMinor: 4000 }), order(SHERPUR.id, { goodsMinor: 2000 }), order(GABTALI.id, { goodsMinor: 1000 })];
  const ads = { districts: [{ key: BOGURA.id, platform: null, spendMinor: 3000, delivered: 2, deliveredSalesMinor: 5000, roasPercent: 167 }, { key: DHAKA.id, platform: null, spendMinor: 900, delivered: 0, deliveredSalesMinor: 0, roasPercent: null }, { key: '', platform: null, spendMinor: 50, delivered: 1, deliveredSalesMinor: 100, roasPercent: null }] };

  it('puts spend, ad-carried sales and return in the district row, and the share of the area\'s Sales', () => {
    const r = buildMoney(PLACES, orders, [], ads, o({ level: 'district' }), DAYS);
    expect(rowFor(r, BOGURA.id).figures).toMatchObject({ adSpendMinor: 3000, adDeliveredSalesMinor: 5000, roasPercent: 167, salesMinor: 7000 });
    expect(rowFor(r, BOGURA.id).figures.adSpendShareOfSales).toBeCloseTo(3000 / 7000);
    expect(r.extras.adLevel).toBe('district');
  });
  it('sums the districts to their division', () => {
    const r = buildMoney(PLACES, orders, [], ads, o({ level: 'division' }), DAYS);
    expect(rowFor(r, RAJ.id).figures.adSpendMinor).toBe(3000);
  });
  it('is not known below the district: null, never 0', () => {
    const r = buildMoney(PLACES, orders, [], ads, o({ level: 'upazila' }), DAYS);
    expect(rowFor(r, GABTALI.id).figures.adSpendMinor).toBeNull();
    expect(r.extras.adLevel).toBeNull();
  });
  it('a spend with no rate is unknown, not 0', () => {
    const unknown = { districts: [{ key: BOGURA.id, platform: null, spendMinor: null, delivered: 1, deliveredSalesMinor: 100, roasPercent: null }] };
    const r = buildMoney(PLACES, orders, [], unknown, o({ level: 'district' }), DAYS);
    expect(rowFor(r, BOGURA.id).figures.adSpendMinor).toBeNull();
    expect(rowFor(r, BOGURA.id).flags).not.toContain('adsExceedSales');
  });
  it('flags an area whose ad spend is over its Sales', () => {
    const big = { districts: [{ key: BOGURA.id, platform: null, spendMinor: 9000, delivered: 1, deliveredSalesMinor: 100, roasPercent: 1 }] };
    expect(rowFor(buildMoney(PLACES, orders, [], big, o({ level: 'district' }), DAYS), BOGURA.id).flags).toContain('adsExceedSales');
  });
});

describe('the styles that sell in each area', () => {
  const lines: MoneyLine[] = [
    { areaId: GABTALI.id, productId: 'polo', pieces: 6, totalMinor: 6000 },
    { areaId: GABTALI.id, productId: 'tee', pieces: 3, totalMinor: 2400 },
    { areaId: GABTALI.id, productId: 'cap', pieces: 1, totalMinor: 500 },
    { areaId: SHERPUR.id, productId: 'polo', pieces: 2, totalMinor: 2000 },
  ];
  const r = buildMoney(PLACES, [order(GABTALI.id), order(SHERPUR.id)], lines, null, o({ topProducts: 2 }), DAYS);
  const stock = r.extras.stock as Record<string, { productId: string; pieces: number; areaSharePct: number }[]>;

  it('lists the best styles per area up to the setting, with the area\'s share of each style', () => {
    expect(stock[GABTALI.id]!.map((e) => e.productId)).toEqual(['polo', 'tee']);
    expect(stock[GABTALI.id]![0]).toMatchObject({ pieces: 6, areaSharePct: 75 });
    expect(stock[SHERPUR.id]![0]).toMatchObject({ productId: 'polo', areaSharePct: 25 });
  });
  it('gives the pieces of the area and lists every named style for the caller to name', () => {
    expect(rowFor(r, GABTALI.id).figures.pieces).toBe(10);
    expect(r.stockIds.sort()).toEqual(['polo', 'tee']);
  });
  it('rolls styles up to the level asked', () => {
    const d = buildMoney(PLACES, [], lines, null, o({ level: 'district', topProducts: 5 }), DAYS);
    const s = d.extras.stock as Record<string, { productId: string; pieces: number }[]>;
    expect(s[BOGURA.id]!.find((e) => e.productId === 'polo')!.pieces).toBe(8);
  });
});

describe('a part the viewer may not see', () => {
  const orders = many(5, () => order(GABTALI.id, { deliveryChargeMinor: 10, courierMinor: 100 }));
  it('without books.read (no delivery or ads part) there is no money in any row', () => {
    const r = buildMoney(PLACES, orders, [{ areaId: GABTALI.id, productId: 'polo', pieces: 2, totalMinor: 10 }], null, o({ parts: new Set<MoneyPart>(['stock']) }), DAYS);
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ salesMinor: null, deliveryChargeMinor: null, deliveryGapMinor: null, profitMinor: null, adSpendMinor: null, pieces: 2 });
    expect(rowFor(r, GABTALI.id).flags).toEqual([]);
    expect(r.hidden).toEqual(['delivery', 'ads']);
  });
  it('without the stock part there are no styles', () => {
    const r = buildMoney(PLACES, orders, [{ areaId: GABTALI.id, productId: 'polo', pieces: 2, totalMinor: 10 }], null, o({ parts: new Set<MoneyPart>(['delivery']) }), DAYS);
    expect(r.extras.stock).toBeNull();
    expect(rowFor(r, GABTALI.id).figures.pieces).toBeNull();
  });
});
