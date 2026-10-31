// PR 178 — the pure parts of the courier choice by cost: a rate card's cost for one parcel (charge plus the COD fee on
// the amount collected, rounded, only when counted) and the order the couriers are offered in. Made-up test values.
import { describe, expect, it } from 'vitest';
import { courierCostMinor, rankCosts, type CourierCost } from './courier-choice';

describe('PR 178 · courierCostMinor', () => {
  it('adds the COD fee on the amount collected only when counted and the card has one', () => {
    expect(courierCostMinor({ chargeMinor: 7_000, codFeeBps: 100 }, 250_050, true)).toBe(7_000 + 2_501);
    expect(courierCostMinor({ chargeMinor: 7_000, codFeeBps: 100 }, 250_050, false)).toBe(7_000);
    expect(courierCostMinor({ chargeMinor: 7_000, codFeeBps: null }, 250_050, true)).toBe(7_000);
    expect(courierCostMinor({ chargeMinor: 7_000, codFeeBps: 100 }, 0, true)).toBe(7_000);
  });
});

describe('PR 178 · rankCosts', () => {
  const c = (courierAccountId: string, name: string, costMinor: number | null): CourierCost => ({ courierAccountId, name, costMinor, why: costMinor === null ? 'NO_RATE' : null });
  it('puts the cheapest known first (ties by name), then the unknown ones by name', () => {
    const out = rankCosts([c('1', 'Zed', null), c('2', 'Bravo', 8_000), c('3', 'Alpha', null), c('4', 'Delta', 6_000), c('5', 'Charlie', 8_000)]);
    expect(out.map((x) => x.name)).toEqual(['Delta', 'Bravo', 'Charlie', 'Alpha', 'Zed']);
  });
  it('never changes the list it was given', () => {
    const list = [c('1', 'B', 2), c('2', 'A', 1)];
    rankCosts(list);
    expect(list.map((x) => x.name)).toEqual(['B', 'A']);
  });
});
