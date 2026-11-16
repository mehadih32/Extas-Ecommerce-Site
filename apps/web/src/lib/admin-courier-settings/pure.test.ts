// PR 1010 — Settings › Couriers: the Fees box reads and changes a courier's open rate cards the way Money › Costs & fees does (ended, never edited).
import { describe, expect, it } from 'vitest';
import { feesOf, lightest, pctToBps, planFees, returnedPct, type OpenCard, type ZoneKeys } from './pure';

const keys: ZoneKeys = { inside: 'city', sub: 'sub', outside: 'out' };
const card = (id: string, zoneKey: string, from: number, to: number, chargeMinor: number, codFeeBps: number | null = 100, returnChargeMinor: number | null = null): OpenCard => ({ id, zoneKey, weightFromGrams: from, weightToGrams: to, chargeMinor, codFeeBps, returnChargeMinor });

describe('fees of a courier', () => {
  const cards = [card('a2', 'city', 1000, 2000, 9000), card('a1', 'city', 0, 1000, 6000), card('b', 'sub', 0, 1000, 8000), card('c', 'out', 0, 1000, 11000, 150)];
  it('shows the lightest weight band of each delivery band', () => {
    expect(lightest(cards, 'city')?.id).toBe('a1');
    expect(feesOf(cards, keys).charge).toEqual({ inside: 6000, sub: 8000, outside: 11000 });
  });
  it('shows the cash fee in percent (the highest on its cards) and nothing for a courier with no rate', () => {
    expect(feesOf(cards, keys).codPct).toBe(1.5);
    expect(feesOf([], keys)).toEqual({ charge: { inside: null, sub: null, outside: null }, codPct: null });
    expect(feesOf([card('x', 'city', 0, 10, 5, null)], keys).codPct).toBeNull();
  });
});

describe('cash fee typed', () => {
  it('takes 0 to the limit with at most two decimals worth of basis points', () => {
    expect(pctToBps('1', 20)).toBe(100);
    expect(pctToBps('1.25', 20)).toBe(125);
    expect(pctToBps(0, 20)).toBe(0);
    expect(pctToBps('20', 20)).toBe(2000);
    expect(pctToBps('20.01', 20)).toBeNull();
    expect(pctToBps('-1', 20)).toBeNull();
    expect(pctToBps('', 20)).toBeNull();
    expect(pctToBps('abc', 20)).toBeNull();
  });
});

describe('what a Save changes', () => {
  const cards = [card('a1', 'city', 0, 1000, 6000), card('a2', 'city', 1000, 2000, 9000), card('b', 'sub', 0, 1000, 8000)];
  const want = { charge: { inside: 6500, sub: 8000, outside: 12000 }, codBps: 100 };
  it('ends the card that changed and adds its replacement with the same weight band; a band with no card gets one for the whole range', () => {
    const p = planFees(cards, keys, want, 1_000_000);
    expect(p.end).toEqual(['a1']);
    expect(p.add).toEqual([
      { zoneKey: 'out', weightFromGrams: 0, weightToGrams: 1_000_000, chargeMinor: 12000, codFeeBps: 100, returnChargeMinor: null },
      { zoneKey: 'city', weightFromGrams: 0, weightToGrams: 1000, chargeMinor: 6500, codFeeBps: 100, returnChargeMinor: null },
    ]);
  });
  it('leaves untouched what already says so, and changing only the cash fee re-issues every card with it', () => {
    expect(planFees(cards, keys, { charge: { inside: 6000, sub: 8000, outside: 1 }, codBps: 100 }, 10).end).toEqual([]);
    const p = planFees(cards, keys, { charge: { inside: 6000, sub: 8000, outside: 1 }, codBps: 200 }, 10);
    expect(p.end.sort()).toEqual(['a1', 'a2', 'b']);
    expect(p.add.every((c) => c.codFeeBps === 200)).toBe(true);
    // the heavier band keeps its own charge
    expect(p.add.find((c) => c.weightFromGrams === 1000)?.chargeMinor).toBe(9000);
  });
  it('keeps the return charge of a card it replaces', () => {
    const p = planFees([card('r', 'city', 0, 1000, 6000, 100, 4000)], keys, { charge: { inside: 7000, sub: 1, outside: 1 }, codBps: 100 }, 10);
    expect(p.add.find((c) => c.zoneKey === 'city')?.returnChargeMinor).toBe(4000);
  });
});

describe('returned share', () => {
  it('is returned over finished, one decimal, nothing with none finished', () => {
    expect(returnedPct(87, 13)).toBe(13);
    expect(returnedPct(0, 0)).toBeNull();
    expect(returnedPct(10, 0)).toBe(0);
    expect(returnedPct(2, 1)).toBe(33.3);
  });
});
