// Follow-up 439 — the print run's filter by courier and category: only what the run holds counts; the rows keep their
// packing order; the orders behind the shown parcels, each once. Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { filterPrintRows, NO_CATEGORY, ordersOf, partOf, partRows, printFilterChoices, printFilterOf } from './print-filter';

const row = (id: string, orderId: string, courier: [string, string], en: string, bn: string | null = null) => ({ id, orderId, courierAccountId: courier[0], courierName: courier[1], category: { en, bn } });
const SF: [string, string] = ['c-sf', 'Steadfast'];
const PT: [string, string] = ['c-pt', 'Pathao'];
const rows = [row('s1', 'o1', SF, 'Panjabi', 'পাঞ্জাবি'), row('s2', 'o2', PT, 'Panjabi', 'পাঞ্জাবি'), row('s3', 'o2', SF, 'Shirt'), row('s4', 'o4', PT, '')];

describe('follow-up 439 · print run filter', () => {
  it('offers each courier (by name) and each category (in packing order, "no category" as its own value)', () => {
    const c = printFilterChoices(rows);
    expect(c.couriers).toEqual([
      { id: 'c-pt', name: 'Pathao' },
      { id: 'c-sf', name: 'Steadfast' },
    ]);
    expect(c.categories.map((x) => x.value)).toEqual(['Panjabi', 'Shirt', NO_CATEGORY]);
    expect(c.categories[0]).toMatchObject({ en: 'Panjabi', bn: 'পাঞ্জাবি' });
  });

  it('keeps a filter only when the run holds it', () => {
    expect(printFilterOf({ courier: 'c-sf', cat: 'Shirt' }, rows)).toEqual({ courier: 'c-sf', category: 'Shirt' });
    expect(printFilterOf({ courier: 'gone', cat: 'Shoes' }, rows)).toEqual({ courier: null, category: null });
    expect(printFilterOf({ courier: ['c-sf', 'c-pt'], cat: ' ' }, rows)).toEqual({ courier: null, category: null });
    expect(printFilterOf({}, [])).toEqual({ courier: null, category: null });
  });

  it('shows the matching rows in their order; both filters together', () => {
    expect(filterPrintRows(rows, { courier: null, category: null }).map((r) => r.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(filterPrintRows(rows, { courier: 'c-pt', category: null }).map((r) => r.id)).toEqual(['s2', 's4']);
    expect(filterPrintRows(rows, { courier: null, category: NO_CATEGORY }).map((r) => r.id)).toEqual(['s4']);
    expect(filterPrintRows(rows, { courier: 'c-sf', category: 'Panjabi' }).map((r) => r.id)).toEqual(['s1']);
  });

  it('names each order once', () => {
    expect(ordersOf(rows)).toEqual(['o1', 'o2', 'o4']);
    expect(ordersOf([])).toEqual([]);
  });
});

describe('PR 731 · print all in parts', () => {
  it('reads the part from the address (a whole number from 1)', () => {
    expect(partOf({ part: '2' })).toBe(2);
    expect(partOf({ part: '0' })).toBeNull();
    expect(partOf({ part: '-1' })).toBeNull();
    expect(partOf({ part: 'x' })).toBeNull();
    expect(partOf({})).toBeNull();
  });
  it('cuts the rows into parts of the owner size, in order; no part or no size shows all', () => {
    const r = [1, 2, 3, 4, 5, 6, 7];
    expect(partRows(r, 1, 3)).toEqual([1, 2, 3]);
    expect(partRows(r, 3, 3)).toEqual([7]);
    expect(partRows(r, 4, 3)).toEqual([]);
    expect(partRows(r, null, 3)).toEqual(r);
    expect(partRows(r, 2, null)).toEqual(r);
  });
});
