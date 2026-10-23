// PR 60 — what the stock line can honestly say.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import type { PdpModel } from './product-model';
import { beforeCutoff, clockIn, cutoffWords, lowStock, stockLine } from './pdp-stock';

const set = productSettings['pdp.stock'].default;
const m: Pick<PdpModel, 'variants' | 'sizes' | 'onSale'> = {
  onSale: true,
  sizes: [
    { key: 'M', label: 'M' },
    { key: 'L', label: 'L' },
  ],
  variants: [
    { id: '1', colour: 'navy', size: 'M', stock: 2, price: 0 },
    { id: '2', colour: 'navy', size: 'L', stock: 0, price: 0 },
    { id: '3', colour: 'white', size: 'M', stock: 9, price: 0 },
    { id: '4', colour: 'red', size: 'M', stock: 0, price: 0 },
  ],
};

describe('PR 60 · the stock line', () => {
  it('"Only N left" from the owner number down, for the colour or the chosen size; 0 switches it off', () => {
    expect(lowStock(m, { colour: 'navy', size: null }, 3)).toEqual({ kind: 'low', n: 2, warn: true });
    expect(lowStock(m, { colour: 'navy', size: 'M' }, 3)).toEqual({ kind: 'lowSize', n: 2, warn: true });
    expect(lowStock(m, { colour: 'white', size: null }, 3)).toBeNull();
    expect(lowStock(m, { colour: 'navy', size: null }, 0)).toBeNull();
  });

  it('a size or colour sold out, a product sold out everywhere, a product taken off sale', () => {
    expect(stockLine(m, { colour: 'navy', size: 'L' }, set, false).kind).toBe('out');
    expect(stockLine(m, { colour: 'red', size: null }, set, false).kind).toBe('soldOut');
    expect(stockLine({ ...m, variants: m.variants.map((v) => ({ ...v, stock: 0 })) }, { colour: 'navy', size: null }, set, false).kind).toBe('gone');
    expect(stockLine({ ...m, onSale: false }, { colour: 'white', size: null }, set, false).kind).toBe('off');
  });

  it('"ships today" only with the owner dispatch time and before it; plain "In stock" otherwise', () => {
    expect(stockLine(m, { colour: 'white', size: null }, set, true)).toEqual({ kind: 'in', n: 0, warn: false });
    expect(stockLine(m, { colour: 'white', size: null }, { ...set, dispatchCutoff: '17:00' }, true).kind).toBe('ships');
    expect(stockLine(m, { colour: 'white', size: null }, { ...set, dispatchCutoff: '17:00' }, false).kind).toBe('in');
  });

  it('the store clock and the cut-off', () => {
    const at = new Date('2026-10-23T10:05:00Z');
    expect(clockIn('Asia/Dhaka', at)).toBe('16:05');
    expect(clockIn('Not/AZone', at)).toBe('10:05');
    expect(beforeCutoff('16:05', '17:00')).toBe(true);
    expect(beforeCutoff('17:00', '17:00')).toBe(false);
    expect(beforeCutoff('16:05', null)).toBe(false);
    expect(cutoffWords('17:00', 'en')).toBe('5 pm');
    expect(cutoffWords('09:30', 'en')).toBe('9:30 am');
    expect(cutoffWords('12:00', 'en')).toBe('12 pm');
    expect(cutoffWords('17:00', 'bn')).toBe('17:00');
  });
});
