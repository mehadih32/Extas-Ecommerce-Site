// PR 164 — the fraud report's rules: outcomes, the caught tally with "wrong" and "stopped", the avoided-cost estimate
// (no estimate without a complete parcel cost), and the RTO groups (several products split one parcel's cost evenly).
// Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { avoidedOf, groupRto, outcomeOf, splitEven, tallyCaught, type CaughtOrder, type ParcelFacts } from './fraud-report-pure';

const cost = (knownMinor: number, complete = true) => ({ parts: [], knownMinor, complete, missing: [] }) as never;

describe('PR 164 · fraud report rules', () => {
  it('outcomes: delivered (also partly), refused, cancelled, open', () => {
    expect(outcomeOf('DELIVERED')).toBe('delivered');
    expect(outcomeOf('PARTIALLY_DELIVERED')).toBe('delivered');
    expect(outcomeOf('RETURNED')).toBe('refused');
    expect(outcomeOf('CANCELLED')).toBe('cancelled');
    expect(outcomeOf('ON_HOLD')).toBe('open');
  });

  it('tally: per step and "any" once per order; wrong out of those that reached the door; stopped only before the courier for a risk reason', () => {
    const o = (status: string, catches: CaughtOrder['catches'], extra: Partial<CaughtOrder> = {}): CaughtOrder => ({ status, catches, handedOver: false, cancelReasonCode: null, advancePaid: false, ...extra });
    const t = tallyCaught([
      o('DELIVERED', ['watch', 'review']),
      o('RETURNED', ['blocklist']),
      o('CANCELLED', ['refuser'], { cancelReasonCode: 'RISK_DECLINED' }),
      o('CANCELLED', ['watch'], { cancelReasonCode: 'CUSTOMER_BEFORE_CONFIRM' }),
      o('CANCELLED', ['watch'], { cancelReasonCode: 'RISK_DECLINED', handedOver: true }),
      o('DELIVERED', ['advance'], { advancePaid: true }),
      o('PLACED', []),
    ]);
    expect(t.caught.any).toEqual({ orders: 6, delivered: 2, refused: 1, cancelled: 3, open: 0 });
    expect(t.caught.watch).toEqual({ orders: 3, delivered: 1, refused: 0, cancelled: 2, open: 0 });
    expect(t.caught.review.orders).toBe(1);
    expect(t.wrong.orders).toBe(2);
    expect(t.wrong.rate).toBeCloseTo(2 / 3);
    expect(t.stopped).toBe(1);
    expect(t.advancePaid).toBe(1);
    expect(tallyCaught([]).wrong.rate).toBeNull();
  });

  it('avoided: the average of complete parcels only; "likely" weighs by the refused share; nothing without a basis', () => {
    const any = { orders: 4, delivered: 1, refused: 3, cancelled: 0, open: 0 };
    expect(avoidedOf(2, [{ cost: cost(10_000) }, { cost: cost(20_000) }, { cost: cost(500, false) }], any)).toEqual({ perParcelMinor: 15_000, basisParcels: 2, upToMinor: 30_000, likelyMinor: 22_500 });
    expect(avoidedOf(2, [{ cost: cost(500, false) }], any)).toEqual({ perParcelMinor: null, basisParcels: 0, upToMinor: null, likelyMinor: null });
    expect(avoidedOf(2, [{ cost: cost(10_000) }], { ...any, delivered: 0, refused: 0 })).toMatchObject({ upToMinor: 20_000, likelyMinor: null });
  });

  it('split: whole parts that add up', () => {
    expect(splitEven(10, 3)).toEqual([4, 3, 3]);
    expect(splitEven(7, 0)).toEqual([]);
  });

  it('groups: costliest first; unknown kept as its own row; several products share one parcel evenly', () => {
    const facts = new Map<string, ParcelFacts>([
      ['a', { district: { key: 'd1', name: 'Testpur', nameBn: null }, campaign: 'eid', products: [{ key: 'p1', name: 'Shirt' }], reason: 'changed-mind' }],
      ['b', { district: null, campaign: null, products: [{ key: 'p1', name: 'Shirt' }, { key: 'p2', name: 'Tee' }], reason: null }],
    ]);
    const g = groupRto(
      [
        { orderId: 'a', courier: 'C1', cost: cost(10_000) },
        { orderId: 'b', courier: 'C1', cost: cost(14_001, false) },
      ],
      facts,
    );
    expect(g.district.map((r) => [r.key, r.knownMinor])).toEqual([
      [null, 14_001],
      ['d1', 10_000],
    ]);
    expect(g.product).toEqual([
      { key: 'p1', name: 'Shirt', nameBn: null, parcels: 2, knownMinor: 17_001, incomplete: 1 },
      { key: 'p2', name: 'Tee', nameBn: null, parcels: 1, knownMinor: 7_000, incomplete: 1 },
    ]);
    expect(g.courier).toEqual([{ key: 'C1', name: 'C1', nameBn: null, parcels: 2, knownMinor: 24_001, incomplete: 1 }]);
    expect(g.reason.map((r) => r.key)).toEqual([null, 'changed-mind']);
  });
});
