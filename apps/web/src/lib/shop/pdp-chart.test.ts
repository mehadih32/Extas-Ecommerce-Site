// PR 57 — which size chart a product uses, and the table the popup draws.
import { describe, expect, it } from 'vitest';
import { chartTable, howToText, isBottom, pickChart, type ChartCandidate, type FieldMeta } from './pdp-chart';

const c = (id: string, o: Partial<ChartCandidate>): ChartCandidate => ({ id, fitKey: null, productId: null, categoryId: null, ...o });

describe('PR 57 · which chart', () => {
  const list = [c('cat-any', { categoryId: 'polos' }), c('cat-slim', { categoryId: 'polos', fitKey: 'slim' }), c('cat-reg', { categoryId: 'polos', fitKey: 'regular' }), c('parent', { categoryId: 'tops' })];

  it("the product's own chart first", () => {
    expect(pickChart([...list, c('own', { productId: 'p1' })], 'p1', ['polos'], 'slim', 'regular')?.id).toBe('own');
  });

  it("then the nearest category: the product's fit, else the fallback fit, else one with no fit", () => {
    expect(pickChart(list, 'p1', ['polos', 'tops'], 'slim', 'regular')?.id).toBe('cat-slim');
    expect(pickChart(list, 'p1', ['polos', 'tops'], 'boxy', 'regular')?.id).toBe('cat-reg');
    expect(pickChart(list, 'p1', ['polos', 'tops'], null, 'loose')?.id).toBe('cat-any');
    expect(pickChart(list, 'p1', ['shirts', 'tops'], null, 'regular')?.id).toBe('parent');
    expect(pickChart(list, 'p1', ['shirts'], null, 'regular')).toBeNull();
  });
});

describe('PR 57 · the table', () => {
  const meta = new Map<string, FieldMeta>([
    ['chest', { key: 'chest', label: 'Chest', unit: 'inch', howTo: 'Under the arms' }],
    ['waist', { key: 'waist', label: 'Waist', unit: 'cm', howTo: null }],
  ]);
  const convert = (v: number, unit: 'inch' | 'cm') => (unit === 'inch' ? { inch: v, cm: Math.round(v * 2.54) } : { inch: Math.round((v / 2.54) * 4) / 4, cm: v });
  const chart = {
    name: 'Polo',
    fields: ['chest', 'waist', 'sleeve'],
    rows: [
      { size: 'L', values: [42, 0, 0] },
      { size: 'M', values: [40, 76, 0] },
      { size: 'XXL', values: [46, 90, 0] },
    ],
  };

  it("only the product's sizes, in the shop's order; a measurement with no value is not a column", () => {
    const t = chartTable(chart, meta, ['M', 'L', 'XL'], convert)!;
    expect(t.fields.map((f) => f.key)).toEqual(['chest', 'waist']);
    expect(t.fields[0]).toEqual({ key: 'chest', label: 'Chest', howTo: 'Under the arms' });
    expect(t.rows).toEqual([
      { size: 'M', inch: [40, 30], cm: [102, 76] },
      { size: 'L', inch: [42, null], cm: [107, null] },
    ]);
  });

  it('no chart when none of its rows or values fit the product', () => {
    expect(chartTable(chart, meta, ['S'], convert)).toBeNull();
    expect(chartTable({ ...chart, rows: [{ size: 'M', values: [0, 0, 0] }] }, meta, ['M'], convert)).toBeNull();
  });

  it("an unknown field keeps its key as its label", () => {
    const t = chartTable({ name: 'x', fields: ['hip'], rows: [{ size: 'M', values: [38] }] }, meta, ['M'], convert)!;
    expect(t.fields[0]).toEqual({ key: 'hip', label: 'hip', howTo: null });
  });

  it("how to measure drops the field name the owner's text already starts with", () => {
    expect(howToText('Chest', 'Chest — across under the arms')).toBe('across under the arms');
    expect(howToText('বুক', 'বুক — বগলের নিচ দিয়ে')).toBe('বগলের নিচ দিয়ে');
    expect(howToText('Chest', 'Across under the arms')).toBe('Across under the arms');
    expect(howToText('Waist', 'Waistband, flat')).toBe('Waistband, flat');
    expect(howToText('Chest', 'Chest')).toBe('Chest');
  });

  it('a bottom garment gets the trousers tip', () => {
    expect(isBottom('trousers', { trousers: 'bottom', polo: 'top' })).toBe(true);
    expect(isBottom('polo', { trousers: 'bottom', polo: 'top' })).toBe(false);
    expect(isBottom(null, { trousers: 'bottom' })).toBe(false);
  });
});
