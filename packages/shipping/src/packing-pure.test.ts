// PR 182 — the packing step's rules without a database: the steps, matching a scanned or typed code to a line, the
// weight gap (both the percent and the grams), the photo state and what stops "Mark packed"; follow-up 433's NOT_PACKED.
import { describe, expect, it } from 'vitest';
import { fulfilmentSettings } from '@extas/settings';
import { handoverProblem } from './fulfil-pure';
import { allChecked, codeKey, dayStart, lineChecks, localDayStart, matchPiece, packBlock, photoState, stepOf, weightGap, type PackFacts } from './packing-pure';

const lines = [
  { id: 'a', sku: 'POLO-NVY-M', barcode: '8901234567890', quantity: 2 },
  { id: 'b', sku: 'TEE-WHT-L', barcode: null, quantity: 1 },
];
const cfg = { check: fulfilmentSettings['fulfilment.packing.check'].default, photo: fulfilmentSettings['fulfilment.packing.photo'].default, weight: fulfilmentSettings['fulfilment.packing.weight'].default };

describe('packing rules', () => {
  it('the steps follow the order state; a held order stays on the step it was held from', () => {
    expect(['CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'PLACED', 'CANCELLED'].map((s) => stepOf(s))).toEqual(['pick', 'pack', 'ready', 'done', null, null]);
    expect(stepOf('ON_HOLD', 'PROCESSING')).toBe('pack');
    expect(stepOf('ON_HOLD', 'PLACED')).toBeNull();
  });

  it('a code matches a line by SKU or barcode, any case or spacing; a complete line or an unknown code is refused', () => {
    expect(codeKey(' polo-nvy-m ')).toBe('POLO-NVY-M');
    let checks = lineChecks(lines, []);
    expect(matchPiece(lines, checks, 'polo-nvy-m')).toEqual({ lineId: 'a' });
    expect(matchPiece(lines, checks, '8901 2345 67890')).toEqual({ lineId: 'a' });
    expect(matchPiece(lines, checks, 'SHIRT-SKY-M')).toEqual({ refused: 'NOT_IN_ORDER' });
    expect(matchPiece(lines, checks, '')).toEqual({ refused: 'NOT_IN_ORDER' });
    checks = lineChecks(lines, [
      { orderItemId: 'a', quantity: 1 },
      { orderItemId: 'a', quantity: 1 },
    ]);
    expect(checks[0]).toEqual({ lineId: 'a', quantity: 2, checked: 2, done: true });
    expect(matchPiece(lines, checks, 'POLO-NVY-M')).toEqual({ refused: 'ALREADY_CHECKED' });
    expect(allChecked(checks)).toBe(false);
    expect(allChecked(lineChecks(lines, [{ orderItemId: 'a', quantity: 5 }, { orderItemId: 'b', quantity: 1 }]))).toBe(true);
    expect(allChecked([])).toBe(false);
  });

  it('follow-up 434: a gap is big only past both the percent and the grams; unknown weights compare nothing', () => {
    const w = { gapPercent: 15, gapGrams: 100 };
    expect(weightGap(500, 640, w)).toMatchObject({ gapGrams: 140, gapPercent: 28, big: true });
    expect(weightGap(500, 560, w)).toMatchObject({ big: false });
    // 20% but only 40 g: a light parcel is not flagged for a few grams
    expect(weightGap(200, 240, w)).toMatchObject({ gapPercent: 20, big: false });
    expect(weightGap(null, 500, w)).toBeNull();
    expect(weightGap(500, null, w)).toBeNull();
  });

  it('SIM-F-010: required means required (unless waived); a reminder never waits; off is off', () => {
    const on = { ...cfg.photo, enabled: true };
    expect(photoState(cfg.photo, 0, false)).toBe('off');
    expect(photoState(on, 0, false)).toBe('missing');
    expect(photoState(on, 0, true)).toBe('waived');
    expect(photoState(on, 1, false)).toBe('ok');
    expect(photoState({ ...on, mode: 'reminder' }, 0, false)).toBe('reminder');
  });

  it('"Mark packed" waits for the lines, then an open card, then the photo, then the weight', () => {
    const done = lineChecks(lines, [{ orderItemId: 'a', quantity: 2 }, { orderItemId: 'b', quantity: 1 }]);
    const base: PackFacts = { check: cfg.check, checks: done, openIssues: 0, photo: 'off', weight: cfg.weight, expectedGrams: 500, weighedGrams: null, weightConfirmed: false };
    expect(packBlock(base)).toBeNull();
    expect(packBlock({ ...base, checks: lineChecks(lines, []), openIssues: 1, photo: 'missing' })).toBe('NOT_CHECKED');
    expect(packBlock({ ...base, openIssues: 1, photo: 'missing' })).toBe('PACKING_ISSUE_OPEN');
    expect(packBlock({ ...base, photo: 'missing' })).toBe('PHOTO_REQUIRED');
    expect(packBlock({ ...base, photo: 'waived' })).toBeNull();
    const weight = { ...cfg.weight, enabled: true };
    expect(packBlock({ ...base, weight })).toBeNull();
    expect(packBlock({ ...base, weight: { ...weight, requireReading: true } })).toBe('WEIGHT_REQUIRED');
    expect(packBlock({ ...base, weight, weighedGrams: 900 })).toBe('WEIGHT_GAP');
    expect(packBlock({ ...base, weight, weighedGrams: 900, weightConfirmed: true })).toBeNull();
  });

  it('follow-up 433: with packing first, an unpacked parcel is NOT_PACKED; the "Handed over" step starts at the local day', () => {
    const facts = { status: 'PENDING_PICKUP', consignmentId: 'C1', codAmountMinor: 100, receiver: { name: 'A', phone: '01700000000', address: 'X' }, order: { totalMinor: 100, walletAppliedMinor: 0, paidMinor: 0 }, target: { name: 'A', phone: '01700000000', address: 'X' }, printCount: 1 };
    expect(handoverProblem({ ...facts, orderStatus: 'CONFIRMED' })).toBeNull();
    expect(handoverProblem({ ...facts, orderStatus: 'CONFIRMED', packedFirst: true })).toBe('NOT_PACKED');
    expect(handoverProblem({ ...facts, orderStatus: 'PACKED', packedFirst: true })).toBeNull();
    // 10:30 in Dhaka (UTC+6) is 04:30 UTC: today began at 18:00 UTC the day before
    expect(dayStart(new Date('2026-10-24T04:30:00Z'), 'Asia/Dhaka', 0).toISOString()).toBe('2026-10-23T18:00:00.000Z');
    expect(dayStart(new Date('2026-10-24T04:30:00Z'), 'Asia/Dhaka', 1).toISOString()).toBe('2026-10-22T18:00:00.000Z');
  });

  it('PR 411: a shop day starts at its local midnight (the Pack screen\'s date filter)', () => {
    expect(localDayStart('2026-10-24', 'Asia/Dhaka').toISOString()).toBe('2026-10-23T18:00:00.000Z');
    expect(localDayStart('2026-10-24', 'UTC').toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(localDayStart('2026-03-01', 'America/New_York').toISOString()).toBe('2026-03-01T05:00:00.000Z');
  });
});
