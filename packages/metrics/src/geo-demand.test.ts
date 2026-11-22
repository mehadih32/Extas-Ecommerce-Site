// S29 · PR 760 — the demand and customers lens without a database: new against repeat customers (a customer counted once
// per area, a guest in neither), the area leaning repeat or new against the whole shop, wishlist adds and searches that
// ended without a sale, guests' demand in "unknown" and never called "without a sale", and the style to push per area.
import { describe, expect, it } from 'vitest';
import { buildDemand, type DemandLine, type DemandOrder, type DemandSearch, type DemandWish } from './geo-demand';
import { BOGURA, GABTALI, PLACES, SHERPUR } from './geo-lens-fixtures';

const DAYS = { from: '2026-10-01', to: '2026-10-31' };
const FROM = new Date('2026-09-30T18:00:00Z'); // the period's start
const before = new Date('2026-08-01T00:00:00Z');
const within = new Date('2026-10-10T00:00:00Z');
const o = (over: Partial<{ level: 'upazila' | 'district'; parentAreaId: string | null; minOrders: number; topProducts: number }> = {}) => ({ level: 'upazila' as const, minOrders: 2, topProducts: 2, ...over });
const ord = (areaId: string | null, customerId: string | null, firstOrderAt: Date | null): DemandOrder => ({ areaId, customerId, firstOrderAt });
const build = (rec: Partial<{ orders: DemandOrder[]; wishes: DemandWish[]; searches: DemandSearch[]; lines: DemandLine[] }>, over = {}) => buildDemand(PLACES, { orders: [], wishes: [], searches: [], lines: [], ...rec }, o(over), { from: FROM }, DAYS);
const rowFor = (r: ReturnType<typeof build>, id: string) => r.rows.find((x) => x.areaId === id)!;

describe('new against repeat customers', () => {
  const r = build({
    orders: [
      ord(GABTALI.id, 'a', before), // repeat
      ord(GABTALI.id, 'a', before), // the same customer twice: once
      ord(GABTALI.id, 'b', before), // repeat
      ord(GABTALI.id, 'c', within), // new
      ord(SHERPUR.id, 'd', within),
      ord(SHERPUR.id, 'e', within),
      ord(SHERPUR.id, null, null), // guest
    ],
  });

  it('counts each customer once per area, as new or repeat by the first order of all', () => {
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ orders: 4, customers: 3, repeatCustomers: 2, newCustomers: 1, repeatShare: 2 / 3 });
  });
  it('a guest order is in neither group but is still an order', () => {
    expect(rowFor(r, SHERPUR.id).figures).toMatchObject({ orders: 3, guestOrders: 1, customers: 2, repeatCustomers: 0, newCustomers: 2 });
  });
  it('flags an area leaning repeat or new against the whole shop, with enough customers', () => {
    // the whole shop: 5 customers, 2 repeat = 0.4; Gabtali 0.67 above, Sherpur 0 below
    expect(rowFor(r, GABTALI.id).flags).toContain('repeatLeaning');
    expect(rowFor(r, SHERPUR.id).flags).toContain('newLeaning');
  });
  it('too few customers is never a leaning', () => {
    const few = build({ orders: [ord(GABTALI.id, 'a', before)] });
    expect(rowFor(few, GABTALI.id).flags).toEqual([]);
  });
  it('a customer who ordered in two areas is a customer of both, and once in the whole shop', () => {
    const two = build({ orders: [ord(GABTALI.id, 'a', before), ord(SHERPUR.id, 'a', before)] });
    expect(two.total).toMatchObject({ customers: 1, repeatCustomers: 1 });
    expect(rowFor(two, GABTALI.id).figures.customers).toBe(1);
    expect(rowFor(two, SHERPUR.id).figures.customers).toBe(1);
  });
});

describe('demand without sales', () => {
  const wishes: DemandWish[] = [
    { areaId: GABTALI.id, productId: 'polo', noSale: true },
    { areaId: GABTALI.id, productId: 'polo', noSale: true },
    { areaId: GABTALI.id, productId: 'tee', noSale: false },
    { areaId: null, productId: 'polo', noSale: false }, // a guest: cannot be tied to a sale
  ];
  const searches: DemandSearch[] = [
    { areaId: GABTALI.id, noSale: true },
    { areaId: GABTALI.id, noSale: false },
    { areaId: null, noSale: false },
    { areaId: null, noSale: false },
  ];
  const r = build({ wishes, searches });

  it('counts adds, searches and how many ended without a sale', () => {
    expect(rowFor(r, GABTALI.id).figures).toMatchObject({ wishlistAdds: 3, wishlistNoSale: 2, searches: 2, searchesNoSale: 1, demandWithoutSales: 3 });
  });
  it('flags a demand gap at minOrders of them', () => {
    expect(rowFor(r, GABTALI.id).flags).toContain('demandGap');
    expect(build({ wishes: [wishes[0]!] }).rows[0]!.flags).toEqual([]);
  });
  it('a guest has no area: in unknown, never "without a sale", and the unlocated share says how much', () => {
    expect(r.unknown).toMatchObject({ wishlistAdds: 1, wishlistNoSale: 0, searches: 2, searchesNoSale: 0 });
    expect(r.extras.unlocatedShare).toBe(3 / 8);
  });
  it('no demand at all has no share', () => {
    expect(build({}).extras.unlocatedShare).toBeNull();
  });
});

describe('the style to push', () => {
  const lines: DemandLine[] = [
    { areaId: GABTALI.id, productId: 'polo', pieces: 7 },
    { areaId: GABTALI.id, productId: 'tee', pieces: 4 },
    { areaId: GABTALI.id, productId: 'cap', pieces: 1 },
    { areaId: SHERPUR.id, productId: 'cap', pieces: 2 },
  ];
  type Prod = Record<string, { top: { productId: string; pieces: number }[]; push: { productId: string; reason: string; count: number } | null }>;

  it('lists the top styles up to the setting', () => {
    const r = build({ lines });
    const p = r.extras.products as Prod;
    expect(p[GABTALI.id]!.top.map((t) => t.productId)).toEqual(['polo', 'tee']);
  });
  it('pushes the style most wished for without a sale, else the best seller', () => {
    const wishes: DemandWish[] = [
      { areaId: GABTALI.id, productId: 'tee', noSale: true },
      { areaId: GABTALI.id, productId: 'tee', noSale: true },
      { areaId: GABTALI.id, productId: 'polo', noSale: true },
    ];
    const p = build({ lines, wishes }).extras.products as Prod;
    expect(p[GABTALI.id]!.push).toEqual({ productId: 'tee', reason: 'wishlist', count: 2 });
    expect(p[SHERPUR.id]!.push).toEqual({ productId: 'cap', reason: 'topSeller', count: 2 });
  });
  it('a wished-for style that nobody bought is still pushed, and is listed for the caller to name', () => {
    const r = build({ lines: [], wishes: [{ areaId: GABTALI.id, productId: 'jacket', noSale: true }] });
    expect((r.extras.products as Prod)[GABTALI.id]!.push).toEqual({ productId: 'jacket', reason: 'wishlist', count: 1 });
    expect(r.productIds).toEqual(['jacket']);
  });
  it('rolls up to the district and keeps the drill-down parent', () => {
    const d = build({ lines }, { level: 'district' });
    expect((d.extras.products as Prod)[BOGURA.id]!.top[0]).toEqual({ productId: 'polo', pieces: 7 });
    const under = build({ orders: [ord(GABTALI.id, 'a', before), ord('upz-savar', 'z', before)] }, { parentAreaId: BOGURA.id });
    expect(under.rows.map((x) => x.areaId)).toEqual([GABTALI.id]);
  });
});
