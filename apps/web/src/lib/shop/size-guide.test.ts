// Follow-up 155 — the size guide's categories and charts (lib/shop/size-guide guideEntries).
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { guideEntries, type GuideAssignmentRow, type GuideCategoryRow, type GuideInput } from './size-guide';

const fields = [
  { key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' },
  { key: 'length', labelEn: 'Length', labelBn: 'লম্বা', unit: 'inch' },
];
const cat = (o: Partial<GuideCategoryRow> & { id: string; slug: string }): GuideCategoryRow => ({
  nameEn: o.slug,
  nameBn: null,
  parentId: null,
  garmentTypeId: 'gt-polo',
  garment: 'polo',
  measurementFields: fields,
  count: 3,
  ...o,
});
const chart = (id: string, o: Partial<GuideAssignmentRow['chart']> = {}): GuideAssignmentRow['chart'] => ({
  id,
  name: `Chart ${id}`,
  fitKey: null,
  columns: ['chest', 'length'],
  rows: [
    { size: 'L', values: [42, 29] },
    { size: 'M', values: [40, 28] },
    { size: 'XL', values: [44, 30] },
  ],
  garmentTypeId: 'gt-polo',
  ...o,
});
const base = (o: Partial<GuideInput> = {}): GuideInput => ({
  lang: 'en',
  cats: [cat({ id: 'c1', slug: 'polos', nameEn: 'Polos', nameBn: 'পোলো' })],
  assignments: [{ categoryId: 'c1', chart: chart('k1') }],
  sizes: [
    { key: 'M', label: 'M' },
    { key: 'L', label: 'L' },
    { key: 'XL', label: 'XL' },
  ],
  fallbackFit: '',
  defaultEaseInch: 4,
  cmDecimals: 0,
  diagramFor: { trouser: 'bottom' },
  finder: registry['pdp.finder'].default,
  ...o,
});

describe('the size guide (follow-up 155)', () => {
  it('lists a selling category with its chart, rows in the shop order, with its link and the finder able to answer', () => {
    const [e, ...rest] = guideEntries(base());
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ slug: 'polos', name: 'Polos', garment: 'polo', bottom: false, href: '/collections/polos', finds: true });
    expect(e!.chart.rows.map((r) => r.size)).toEqual(['M', 'L', 'XL']);
    expect(e!.chart.fields.map((f) => f.label)).toEqual(['Chest', 'Length']);
    expect(e!.chart.easeInch).toBe(4);
    expect(e!.labels).toEqual({ M: 'M', L: 'L', XL: 'XL' });
  });

  it('speaks Bengali on /bn: the name, the measure names and the link', () => {
    const [e] = guideEntries(base({ lang: 'bn' }));
    expect(e).toMatchObject({ name: 'পোলো', href: '/bn/collections/polos' });
    expect(e!.chart.fields.map((f) => f.label)).toEqual(['বুক', 'লম্বা']);
  });

  it('leaves out a category with nothing on sale, one without a chart, and one whose chart is of another garment', () => {
    const cats = [
      cat({ id: 'c1', slug: 'polos', count: 0 }),
      cat({ id: 'c2', slug: 'tees' }),
      cat({ id: 'c3', slug: 'shirts', garmentTypeId: 'gt-shirt', garment: 'shirt' }),
    ];
    expect(guideEntries(base({ cats, assignments: [{ categoryId: 'c1', chart: chart('k1') }, { categoryId: 'c3', chart: chart('k3') }] }))).toEqual([]);
  });

  it('a sub-category takes its parent`s chart (left out as a repeat) unless it has its own; a parent with only sub-category products counts', () => {
    const cats = [
      // a sub-category sorted before its parent still comes after it, and is left out as a repeat
      cat({ id: 'k1', slug: 'slim', parentId: 'p', count: 2 }),
      cat({ id: 'p', slug: 'tops', count: 0 }),
      cat({ id: 'k2', slug: 'trousers', parentId: 'p', count: 1, garmentTypeId: 'gt-tr', garment: 'trouser' }),
    ];
    const assignments = [
      { categoryId: 'p', chart: chart('a') },
      { categoryId: 'k2', chart: chart('b', { garmentTypeId: 'gt-tr', columns: ['waist'], rows: [{ size: '32', values: [32] }] }) },
    ];
    const out = guideEntries(base({ cats, assignments, sizes: [...base().sizes, { key: '32', label: '32' }] }));
    expect(out.map((e) => [e.slug, e.chart.name, e.bottom])).toEqual([
      ['tops', 'Chart a', false],
      ['trousers', 'Chart b', true],
    ]);
  });

  it('a chart the finder cannot read stays in the tables but is not offered in the window; finder off: none offered', () => {
    const own = chart('k1', { columns: ['shoulder'], rows: [{ size: 'M', values: [18] }] });
    const [e] = guideEntries(base({ assignments: [{ categoryId: 'c1', chart: own }] }));
    expect(e!.finds).toBe(false);
    expect(e!.chart.fields.map((f) => f.key)).toEqual(['shoulder']);
    const [off] = guideEntries(base({ finder: { ...registry['pdp.finder'].default, on: false } }));
    expect(off!.finds).toBe(false);
  });

  it('picks the shop`s fallback fit among a category`s charts, and a chart with no readable row is no table', () => {
    const assignments = [
      { categoryId: 'c1', chart: chart('slim', { fitKey: 'slim' }) },
      { categoryId: 'c1', chart: chart('regular', { fitKey: 'regular' }) },
    ];
    expect(guideEntries(base({ assignments, fallbackFit: 'regular' }))[0]!.chart.name).toBe('Chart regular');
    expect(guideEntries(base({ assignments: [{ categoryId: 'c1', chart: chart('e', { rows: [] }) }] }))).toEqual([]);
  });
});
