// Follow-up 57 — the places under the address box: the part being typed is looked up, a pick replaces only that part,
// a row shows the charge only when the place settles one priced band.
import { describe, expect, it } from 'vitest';
import { applyPick, fragmentOf, lookupsOf, rowView, wantsRows, type SuggestRow } from './address-suggest';

const row = (over: Partial<SuggestRow> = {}): SuggestRow => ({
  place: { id: 'p1', nameEn: 'Gabtoli', nameBn: 'গাবতলী', parentEn: 'Bogura', parentBn: 'বগুড়া' },
  matched: 'Gabtoli',
  band: { priced: true, chargeMinor: 13000 },
  ...over,
});

describe('the part being typed', () => {
  it('is what lies between the commas around the caret, trimmed', () => {
    expect(fragmentOf('House 12, Road 5, Gabt')).toEqual({ start: 18, end: 22, query: 'Gabt' });
    expect(fragmentOf('Gabt')).toEqual({ start: 0, end: 4, query: 'Gabt' });
    const line = 'House 12, Gabt , Dhaka';
    expect(fragmentOf(line, 14).query).toBe('Gabt');
    expect(fragmentOf('a\nMirp').query).toBe('Mirp');
    expect(fragmentOf('', 0)).toEqual({ start: 0, end: 0, query: '' });
  });

  it('is looked up whole, then by its last two words, then its last word', () => {
    const line = 'House 12 Road 5 Gabt';
    expect(lookupsOf(line, fragmentOf(line)).map((f) => f.query)).toEqual(['House 12 Road 5 Gabt', '5 Gabt', 'Gabt']);
    expect(lookupsOf('Mirpur', fragmentOf('Mirpur')).map((f) => f.query)).toEqual(['Mirpur']);
  });

  it('a pick writes "place, district" over that part only, and the caret goes after it', () => {
    const line = 'House 12, Road 5, Gabt';
    const r = rowView(row(), 'en');
    expect(applyPick(line, fragmentOf(line), r.text)).toEqual({ line: 'House 12, Road 5, Gabtoli, Bogura', caret: 33 });
    const mid = 'House 12, Gabt, Dhaka';
    expect(applyPick(mid, fragmentOf(mid, 14), r.text).line).toBe('House 12, Gabtoli, Bogura, Dhaka');
  });

  it('asks only with enough letters, and not again for the line a pick just wrote', () => {
    expect(wantsRows('G', fragmentOf('G'), 2, null)).toBe(false);
    expect(wantsRows('Ga', fragmentOf('Ga'), 2, null)).toBe(true);
    const picked = 'House 12, Gabtoli, Bogura';
    expect(wantsRows(`${picked}, `, fragmentOf(`${picked}, `), 2, picked)).toBe(false);
    expect(wantsRows(`${picked}, Ho`, fragmentOf(`${picked}, Ho`), 2, picked)).toBe(true);
  });
});

describe('a row', () => {
  it('is in the page`s language, with its district', () => {
    expect(rowView(row(), 'bn')).toEqual({ id: 'p1', name: 'গাবতলী', parent: 'বগুড়া', chargeMinor: 13000, text: 'গাবতলী, বগুড়া' });
    expect(rowView(row({ place: { id: 'p2', nameEn: 'Mirpur', nameBn: null, parentEn: null, parentBn: null } }), 'bn').text).toBe('Mirpur');
  });

  it('shows no charge for a place of several bands or an unpriced band', () => {
    expect(rowView(row({ band: null }), 'en').chargeMinor).toBeNull();
    expect(rowView(row({ band: { priced: false, chargeMinor: 13000 } }), 'en').chargeMinor).toBeNull();
  });
});
