// PR 610 (CN-028, ERP contract v6, site-changes-v6 §2.5.1): the order's pieces and their whole-taka customer prices.
// Pure: no database. Every amount is in minor units (BDT: 2 decimals), so 1 taka = 100.
import { describe, expect, it } from 'vitest';
import { erpAmount, erpPieces, wholeTaka, wireKey, type ErpItemInput } from '../src';

const T = 100;
const item = (id: string, sku: string, quantity: number, unitTaka: number, lineTaka: number, combo?: string): ErpItemInput => ({
  orderItemId: id,
  sku,
  quantity,
  unitPriceMinor: unitTaka * T,
  lineTotalMinor: Math.round(lineTaka * T),
  ...(combo ? { comboId: `combo-${combo}`, comboGroupKey: combo } : {}),
});
const taka = (pieces: { customerPriceMinor: number }[]) => pieces.map((p) => p.customerPriceMinor / T);

describe('PR 610: erpPieces', () => {
  it('sends one piece per unit (quantity 1 per lineId, follow-up 491), each priced in whole taka', () => {
    const p = erpPieces([item('a', 'POLO-M', 3, 650, 1950)], 0, 2);
    expect(p.map((x) => [x.orderItemId, x.piece, x.sku])).toEqual([
      ['a', 1, 'POLO-M'],
      ['a', 2, 'POLO-M'],
      ['a', 3, 'POLO-M'],
    ]);
    expect(taka(p)).toEqual([650, 650, 650]);
  });

  it('a combo of 3 for 1600 taka: 533, 533, 534 (the remainder on the last piece)', () => {
    const p = erpPieces([item('a', 'TEE-1', 1, 650, 533.33, 'set'), item('b', 'TEE-2', 1, 650, 533.33, 'set'), item('c', 'TEE-3', 1, 650, 533.34, 'set')], 0, 2);
    expect(taka(p)).toEqual([533, 533, 534]);
    expect(p.every((x) => x.comboId === 'combo-set')).toBe(true);
  });

  it('a combo line with 3 pieces of one SKU is split the same way', () => {
    expect(taka(erpPieces([item('a', 'TEE-1', 3, 650, 1600, 'set')], 0, 2))).toEqual([533, 533, 534]);
  });

  it("spreads the order's own discount over the lines by value; the pieces add up to the order in whole taka", () => {
    const items = [item('a', 'POLO-M', 1, 1000, 1000), item('b', 'POLO-L', 2, 500, 1000)];
    const p = erpPieces(items, 301 * T, 2);
    const sum = p.reduce((s, x) => s + x.customerPriceMinor, 0);
    expect(sum).toBe(1699 * T);
    expect(p.every((x) => x.customerPriceMinor % T === 0)).toBe(true);
    // 150.50 off each line: line a 849.50, line b 849.50 (424.75 each)
    expect(taka(p)).toEqual([849, 424, 426]);
  });

  it('a discount larger than the goods never makes a price below zero', () => {
    const p = erpPieces([item('a', 'POLO-M', 2, 100, 200)], 999 * T, 2);
    expect(taka(p)).toEqual([0, 0]);
  });

  it('is deterministic and keeps the order of the lines', () => {
    const items = [item('x', 'A', 1, 333, 333.33), item('y', 'B', 2, 333, 666.67, 'g'), item('z', 'C', 1, 100, 99.99, 'g')];
    const a = erpPieces(items, 17, 2);
    expect(erpPieces(items, 17, 2)).toEqual(a);
    expect(a.map((x) => x.orderItemId)).toEqual(['x', 'y', 'y', 'z']);
    expect(a.reduce((s, x) => s + x.customerPriceMinor, 0)).toBe(1100 * T); // 1099.99 − 0.17 = 1099.82, rounded to the taka
  });

  it('works for a currency without decimals', () => {
    expect(erpPieces([item('a', 'S', 3, 0, 0)].map((i) => ({ ...i, unitPriceMinor: 1000, lineTotalMinor: 1600 })), 0, 0).map((x) => x.customerPriceMinor)).toEqual([533, 533, 534]);
    expect(wholeTaka(53349, 2)).toBe(533);
  });

  it('the wire key: the row key, then a new round after a refusal the ERP keeps against the key', () => {
    expect(wireKey({ idempotencyKey: 'order:abc:r0', keyRound: 0 })).toBe('order:abc:r0');
    expect(wireKey({ idempotencyKey: 'order:abc:r0', keyRound: 2 })).toBe('order:abc:r0:k2');
  });
});

describe("PR 610: the ERP's amounts are read exactly, never rounded (the books match them with zero tolerance)", () => {
  it('reads plain decimals and a trailing zero past the currency digits', () => {
    expect(erpAmount('1950', 2)).toBe(195000);
    expect(erpAmount('1950.5', 2)).toBe(195050);
    expect(erpAmount('1950.50', 2)).toBe(195050);
    expect(erpAmount('1950.500', 2)).toBe(195050);
    expect(erpAmount('-12.34', 2)).toBe(-1234);
    expect(erpAmount(null, 2)).toBeNull();
    expect(erpAmount(undefined, 2)).toBeNull();
  });

  it('refuses an amount with more decimals than the currency has, or one it cannot read, instead of rounding it', () => {
    expect(() => erpAmount('1950.005', 2)).toThrow(/exactly/);
    expect(() => erpAmount('1950.5', 0)).toThrow(/exactly/);
    expect(() => erpAmount('1,950', 2)).toThrow(/exactly/);
    expect(() => erpAmount('', 2)).toThrow(/exactly/);
  });
});
