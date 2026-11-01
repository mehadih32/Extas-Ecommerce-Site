// S14 · PR 287 — the segment builder's rows to a definition and back: empty rows left out, a bad number marked, money
// typed in whole taka and stored in poisha, a yes/no and a consent kept as they are.
import { describe, expect, it } from 'vitest';
import { moneyOf } from '@/components/admin/products/model';
import { draftDefinition, draftRows, rowCondition, startValue } from './segment-draft';

const money = moneyOf('BDT', 'en'); // hardcode-ok: test currency

describe('segment builder rows (PR 287)', () => {
  it('a filled row is a condition, an empty one is left out, a bad one is marked', () => {
    expect(rowCondition({ field: 'ordersMin', value: '2' }, money)).toEqual({ field: 'ordersMin', value: 2 });
    expect(rowCondition({ field: 'ordersMin', value: ' ' }, money)).toBeNull();
    expect(rowCondition({ field: 'ordersMin', value: '2.5' }, money)).toBe('bad');
    expect(rowCondition({ field: 'deliveryMin', value: '101' }, money)).toBe('bad');
    expect(rowCondition({ field: 'lastOrderOver', value: '0' }, money)).toBe('bad');
    expect(rowCondition({ field: 'salesMin', value: '1,500' }, money)).toEqual({ field: 'salesMin', value: 150_000 });
    expect(rowCondition({ field: 'refused', value: 'false' }, money)).toEqual({ field: 'refused', value: false });
    expect(rowCondition({ field: 'consent', value: 'sms' }, money)).toEqual({ field: 'consent', value: 'sms' });
    expect(rowCondition({ field: 'consent', value: 'email' }, money)).toBe('bad');
  });

  it('the definition keeps only filled, valid rows, and reads back as the same rows', () => {
    const rows = [
      { field: 'ordersMin', value: '2' },
      { field: 'salesMin', value: '' },
      { field: 'salesMin', value: '2000' },
      { field: 'size', value: 'M' },
    ] as const;
    const def = draftDefinition(rows, money);
    expect(def).toEqual({ v: 1, all: [{ field: 'ordersMin', value: 2 }, { field: 'salesMin', value: 200_000 }, { field: 'size', value: 'M' }] });
    expect(draftRows(def, money)).toEqual([
      { field: 'ordersMin', value: '2' },
      { field: 'salesMin', value: '2000' },
      { field: 'size', value: 'M' },
    ]);
    expect(draftRows(null, money)).toEqual([]);
    expect(startValue('consent')).toBe('sms');
    expect(startValue('refused')).toBe('true');
    expect(startValue('ordersMin')).toBe('');
  });
});
