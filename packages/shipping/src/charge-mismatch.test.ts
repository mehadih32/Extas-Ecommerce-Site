// S08 · PR 564 — the charge mismatch log's pure parts: which bands a courier's charge fits (plain or with its COD fee,
// at the parcel's weight, the card valid then), the band read only when exactly one other band fits, the gap (none on a
// free delivery), and the report's months in the store's time zone. Every value is made up.
import { describe, expect, it } from 'vitest';
import { bandsForCharge, courierReadBand, mismatchGap, monthsBack } from './charge-mismatch';

const card = (zoneKey: string, chargeMinor: number, o: { from?: number; to?: number; codFeeBps?: number | null; validFrom?: Date; validTo?: Date | null } = {}) => ({
  zoneKey,
  weightFromGrams: o.from ?? 0,
  weightToGrams: o.to ?? 1_000,
  chargeMinor,
  codFeeBps: o.codFeeBps ?? null,
  returnChargeMinor: null,
  validFrom: o.validFrom ?? new Date(0),
  validTo: o.validTo ?? null,
});
const at = new Date('2026-11-01T06:00:00Z');

describe('bandsForCharge', () => {
  const cards = [card('city', 6_000, { codFeeBps: 100 }), card('sub', 10_000), card('out', 11_000), card('out', 13_000, { from: 1_001, to: 3_000 })];
  it('finds the bands whose card at the weight gives the charge', () => {
    expect(bandsForCharge(cards, { chargeMinor: 11_000, weightGrams: 500, collectMinor: 0, at })).toEqual(['out']);
    expect(bandsForCharge(cards, { chargeMinor: 13_000, weightGrams: 2_000, collectMinor: 0, at })).toEqual(['out']);
    expect(bandsForCharge(cards, { chargeMinor: 9_000, weightGrams: 500, collectMinor: 0, at })).toEqual([]);
  });
  it('counts the COD fee on the amount collected', () => {
    expect(bandsForCharge(cards, { chargeMinor: 7_000, weightGrams: 500, collectMinor: 100_000, at })).toEqual(['city']);
    expect(bandsForCharge(cards, { chargeMinor: 6_000, weightGrams: 500, collectMinor: 100_000, at })).toEqual(['city']);
  });
  it('an unknown weight reads only a band with one card; an old card no longer counts', () => {
    expect(bandsForCharge(cards, { chargeMinor: 10_000, weightGrams: null, collectMinor: 0, at })).toEqual(['sub']);
    expect(bandsForCharge(cards, { chargeMinor: 11_000, weightGrams: null, collectMinor: 0, at })).toEqual([]);
    const old = [card('sub', 9_000, { validTo: new Date('2026-10-01T00:00:00Z') }), card('sub', 10_000, { validFrom: new Date('2026-10-01T00:00:00Z') })];
    expect(bandsForCharge(old, { chargeMinor: 9_000, weightGrams: 500, collectMinor: 0, at })).toEqual([]);
    expect(bandsForCharge(old, { chargeMinor: 9_000, weightGrams: 500, collectMinor: 0, at: new Date('2026-09-01T00:00:00Z') })).toEqual(['sub']);
  });
});

describe('courierReadBand and the gap', () => {
  it('reads a band only when exactly one other band fits', () => {
    expect(courierReadBand('city', ['out'])).toBe('out');
    expect(courierReadBand('city', ['city'])).toBeNull();
    expect(courierReadBand('city', [])).toBeNull();
    expect(courierReadBand('city', ['sub', 'out'])).toBeNull();
  });
  it('is the courier band less the paid band, nothing on a free delivery', () => {
    expect(mismatchGap({ paidBandMinor: 8_000, courierBandMinor: 13_000, freeDelivery: false })).toBe(5_000);
    expect(mismatchGap({ paidBandMinor: 13_000, courierBandMinor: 8_000, freeDelivery: false })).toBe(-5_000);
    expect(mismatchGap({ paidBandMinor: 8_000, courierBandMinor: 13_000, freeDelivery: true })).toBe(0);
  });
});

describe('monthsBack', () => {
  it('counts back from the store-local month, across a year', () => {
    // 31 Oct 19:00 UTC is already 1 Nov in Dhaka
    expect(monthsBack(new Date('2026-10-31T19:00:00Z'), 'Asia/Dhaka', 3)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(monthsBack(new Date('2026-02-10T00:00:00Z'), 'Asia/Dhaka', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
  });
});
