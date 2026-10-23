// PR 56 — the size boxes and the measurement line of the chosen size.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import type { PdpChart, PdpModel } from './product-model';
import { measureParts, measureText, sizePills } from './pdp-size';

const m: Pick<PdpModel, 'sizes' | 'variants' | 'colours'> = {
  colours: [
    { key: 'navy', name: 'Navy', hex: '#123', note: null },
    { key: 'white', name: 'White', hex: '#fff', note: null },
  ],
  sizes: ['M', 'L', 'XL'].map((k) => ({ key: k, label: k })),
  variants: [
    { id: '1', colour: 'navy', size: 'M', stock: 2, price: 0 },
    { id: '2', colour: 'navy', size: 'L', stock: 0, price: 0 },
    { id: '3', colour: 'white', size: 'L', stock: 1, price: 0 },
    { id: '4', colour: 'navy', size: 'XL', stock: 0, price: 0 },
    { id: '5', colour: 'white', size: 'XL', stock: 0, price: 0 },
  ],
};

describe('PR 56 · size boxes', () => {
  it('marks the chosen size, crosses out a size out of stock in this colour, and knows one gone everywhere', () => {
    expect(sizePills(m, { colour: 'navy', size: 'M' }, 'cross')).toEqual([
      { key: 'M', label: 'M', on: true, out: false, gone: false },
      { key: 'L', label: 'L', on: false, out: true, gone: false },
      { key: 'XL', label: 'XL', on: false, out: true, gone: true },
    ]);
  });

  it('SIM-F-035 (acceptance): by default a size sold out in every colour stays on the page, crossed out, never disappears', () => {
    const def = productSettings['pdp.size'].default;
    expect(def.soldOutEverywhere).toBe('cross');
    const xl = sizePills(m, { colour: 'white', size: null }, def.soldOutEverywhere).find((p) => p.key === 'XL');
    expect(xl).toMatchObject({ out: true, gone: true });
    // "tell me when it is back" waits for the alert that answers it (PR 71): off until then (CN-018)
    expect(def.notifyBack).toBe(false);
  });

  it('SIM-F-035: a size sold out in every colour can be left out (unless it is the chosen one)', () => {
    expect(sizePills(m, { colour: 'navy', size: null }, 'hide').map((p) => p.key)).toEqual(['M', 'L']);
    expect(sizePills(m, { colour: 'navy', size: 'XL' }, 'hide').map((p) => p.key)).toEqual(['M', 'L', 'XL']);
  });

  it('a product with no colours counts every variant', () => {
    const plain = { colours: [], sizes: [{ key: 'M', label: 'M' }], variants: [{ id: '1', colour: null, size: 'M', stock: 1, price: 0 }] };
    expect(sizePills(plain, { colour: null, size: null }, 'cross')[0]).toMatchObject({ out: false, gone: false });
  });
});

describe('PR 56 · the measurement line', () => {
  const chart: PdpChart = {
    name: 'Polo',
    easeInch: 4,
    fields: [
      { key: 'chest', label: 'chest', howTo: null },
      { key: 'length', label: 'length', howTo: null },
    ],
    rows: [{ size: 'M', inch: [40, null], cm: [101.6, null] }],
  };

  it("every field the chart has a value for, in the chart's order and the chosen unit", () => {
    expect(measureParts(chart, 'M', 'inch')).toEqual([{ field: 'chest', value: 40 }]);
    expect(measureParts(chart, 'M', 'cm')).toEqual([{ field: 'chest', value: 101.6 }]);
    expect(measureParts(chart, 'L', 'inch')).toEqual([]);
    expect(measureParts(null, 'M', 'inch')).toEqual([]);
    expect(measureParts(chart, null, 'inch')).toEqual([]);
  });

  it('writes a value without trailing noise', () => {
    expect(measureText(40.25)).toBe('40.25');
    expect(measureText(101.60000001)).toBe('101.6');
  });
});
