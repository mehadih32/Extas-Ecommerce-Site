// S29 · PR 761 — the advisor's suggestions from made-up lens figures (no database, no AI): each one needs its lens and its
// numbers, the ad lists are Where to advertise's own words, and the wording carries the numbers in both languages.
import { describe, expect, it } from 'vitest';
import type { LensResult, LensRowOut } from '@extas/metrics';
import { suggestionsFrom, textOf, type AdviceInput } from './advisor-model';

const row = (areaId: string, nameEn: string, figures: Record<string, number | null>, flags: string[] = []): LensRowOut => ({
  areaId,
  nameEn,
  nameBn: null,
  parentAreaId: null,
  parentNameEn: null,
  parentNameBn: null,
  figures,
  flags,
});
const lens = (rows: LensRowOut[], extras: Record<string, unknown> = {}): LensResult =>
  ({
    level: 'district',
    days: { from: '2026-11-01', to: '2026-11-15' },
    rows,
    unknown: {},
    outside: {},
    total: {},
    extras,
    hidden: [],
  }) as unknown as LensResult;

const base: AdviceInput = {
  minOrders: 10,
  guide: { minOrders: 10, goodReturnPct: 15, badReturnPct: 30 },
  districts: null,
  risk: null,
  money: null,
  demand: null,
  courier: null,
  coverage: null,
};

describe('suggestionsFrom', () => {
  it('makes nothing from no lenses', () => {
    expect(suggestionsFrom(base)).toEqual([]);
  });

  it('asks for an advance where a return hotspot had parcels refused at the door, or where the risk score flags', () => {
    const risk = lens([
      row('d1', 'Bogura', { returnRate: 0.4, settled: 20, refusedAtDoor: 6 }, ['returnHotspot']),
      row('d2', 'Rangpur', { returnRate: 0.4, settled: 20, refusedAtDoor: 0 }, ['returnHotspot']),
      row('d3', 'Khulna', { highRiskShare: 0.5, scored: 12, highRisk: 6 }, ['riskArea']),
      row('d4', 'Sylhet', { returnRate: 0.05, settled: 30, refusedAtDoor: 1 }, []),
    ]);
    const s = suggestionsFrom({ ...base, risk });
    expect(s.map((x) => x.key).sort()).toEqual(['codAdvance:d1', 'codAdvance:d3']);
    expect(s.find((x) => x.key === 'codAdvance:d1')!.numbers).toMatchObject({
      returnRatePct: 40,
      settled: 20,
      refusedAtDoor: 6,
    });
  });

  it('only counts delivery that costs more than it brings in when the flag is there, and never invents a charge', () => {
    const money = lens([
      row(
        'd1',
        'Bogura',
        {
          deliveryChargeMinor: 5000,
          courierMinor: 9000,
          deliveryGapMinor: -4000,
          courierKnownOrders: 10,
          freeDeliveryOrders: 3,
        },
        ['deliveryEatsProfit'],
      ),
      row('d2', 'Dhaka', { deliveryGapMinor: 100 }),
    ]);
    const s = suggestionsFrom({ ...base, money });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      kind: 'deliveryCharge',
      areaId: 'd1',
      numbers: { gapMinor: -4000 },
    });
    expect(textOf(s[0]!, 'en', 'BDT').facts.join(' ')).toContain('-40.00 BDT');
  });

  it('suggests a courier only where the best one beats the one used now, over enough parcels', () => {
    const courier = [
      {
        areaId: 'a',
        nameEn: 'Gabtali',
        nameBn: null,
        bestCourier: 'Pathao',
        bestRate: 0.9,
        currentRate: 0.7,
        settled: 20,
      },
      {
        areaId: 'b',
        nameEn: 'Sherpur',
        nameBn: null,
        bestCourier: 'Pathao',
        bestRate: 0.9,
        currentRate: 0.7,
        settled: 5,
      },
      {
        areaId: 'c',
        nameEn: 'Savar',
        nameBn: null,
        bestCourier: 'Steadfast',
        bestRate: 0.8,
        currentRate: 0.8,
        settled: 50,
      },
      {
        areaId: 'd',
        nameEn: 'Uttara',
        nameBn: null,
        bestCourier: 'Steadfast',
        bestRate: 0.8,
        currentRate: null,
        settled: 50,
      },
    ];
    expect(suggestionsFrom({ ...base, courier }).map((x) => x.key)).toEqual(['courier:a']);
  });

  it('lists coverage gaps only for areas with orders', () => {
    const s = suggestionsFrom({
      ...base,
      coverage: [
        { areaId: 'a', nameEn: 'X', nameBn: null, orders: 4 },
        { areaId: 'b', nameEn: 'Y', nameBn: null, orders: 0 },
      ],
    });
    expect(s.map((x) => x.key)).toEqual(['coverage:a']);
  });

  it("makes the ad lists with Where to advertise's own words (more, less; few and hold are left out)", () => {
    const d = (areaId: string, nameEn: string, delivered: number, returned: number) => ({
      areaId,
      nameEn,
      nameBn: null,
      delivered,
      returned,
    });
    const districts = [
      d('1', 'Dhaka', 90, 10),
      d('2', 'Bogura', 12, 8),
      d('3', 'Rangpur', 70, 20),
      d('4', 'Barishal', 3, 1),
      d('5', 'Khulna', 9, 1),
    ];
    const s = suggestionsFrom({ ...base, districts });
    const less = s.find((x) => x.kind === 'adLess')!;
    const more = s.find((x) => x.kind === 'adMore')!;
    expect(less.list?.en).toBe('Bogura');
    expect(more.list?.en).toBe('Dhaka'); // 10% returned of 100; Rangpur 22% is hold, Khulna hold (9 delivered), Barishal few
    expect(more.numbers.districts).toBeGreaterThanOrEqual(1);
  });

  it('pushes a style only when its wishlist count reaches the map minimum', () => {
    const demand = lens([row('d1', 'Bogura', { wishlistNoSale: 20, demandWithoutSales: 22 }), row('d2', 'Dhaka', {})], {
      products: {
        d1: {
          top: [],
          push: { productId: 'p1', reason: 'wishlist', count: 12 },
        },
        d2: {
          top: [],
          push: { productId: 'p1', reason: 'wishlist', count: 3 },
        },
      },
      productNames: { p1: { nameEn: 'Polo', nameBn: 'পোলো' } },
    });
    const s = suggestionsFrom({ ...base, demand });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      kind: 'pushProduct',
      areaId: 'd1',
      item: { en: 'Polo', bn: 'পোলো' },
    });
  });

  it('keeps stock near only for styles with enough pieces', () => {
    const money = lens([row('d1', 'Bogura', {}), row('d2', 'Dhaka', {})], {
      stock: {
        d1: [
          {
            productId: 'p1',
            pieces: 30,
            areaSharePct: 55.5,
            nameEn: 'Polo',
            nameBn: null,
          },
        ],
        d2: [
          {
            productId: 'p1',
            pieces: 4,
            areaSharePct: 5,
            nameEn: 'Polo',
            nameBn: null,
          },
        ],
      },
    });
    expect(suggestionsFrom({ ...base, money }).map((x) => x.key)).toEqual(['keepStock:d1']);
  });

  it('reads the ones that lose money first, then by weight', () => {
    const risk = lens([
      row('d1', 'A', { returnRate: 0.5, settled: 10, refusedAtDoor: 2 }, ['returnHotspot']),
      row('d2', 'B', { returnRate: 0.5, settled: 40, refusedAtDoor: 2 }, ['returnHotspot']),
    ]);
    const money = lens([row('d1', 'A', { deliveryGapMinor: -100 }, ['deliveryEatsProfit'])]);
    const s = suggestionsFrom({ ...base, risk, money });
    expect(s.map((x) => x.key)).toEqual(['codAdvance:d2', 'codAdvance:d1', 'deliveryCharge:d1']);
  });
});

describe('textOf', () => {
  it('carries the numbers, in the owner’s language, and never names a decision as done', () => {
    const risk = lens([row('d1', 'Bogura', { returnRate: 0.4, settled: 20, refusedAtDoor: 6 }, ['returnHotspot'])]);
    const s = suggestionsFrom({ ...base, risk })[0]!;
    const en = textOf(s, 'en', 'BDT');
    const bn = textOf(s, 'bn', 'BDT');
    expect(en.title).toContain('Bogura');
    expect(en.facts.join(' ')).toMatch(/40% of 20/);
    expect(bn.facts.join(' ')).toContain('40%');
    expect(bn.title).toMatch(/[ঀ-৿]/);
  });
});
