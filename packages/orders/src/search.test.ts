// S05 · PR 154 — the order search's condition without a database: Bengali digits count as digits, the phone is matched
// only for what looks like a phone, the tracking number ignores spaces, and an empty box finds everything.
import { describe, expect, it } from 'vitest';
import { orderSearchWhere, searchText, westernDigits } from './search';

const fields = (w: ReturnType<typeof orderSearchWhere>) => (w.OR ?? []).map((c) => Object.keys(c)[0]);

describe('the order search', () => {
  it('Bengali digits are digits; spaces are squeezed', () => {
    expect(westernDigits('০১৭১২ ৩৪৫৬৭৮')).toBe('01712 345678');
    expect(searchText('  EX   ১০০১ ')).toBe('EX 1001');
  });

  it('an empty box finds everything', () => {
    expect(orderSearchWhere('')).toEqual({});
    expect(orderSearchWhere('   ')).toEqual({});
    expect(orderSearchWhere(undefined)).toEqual({});
  });

  it('a phone in any form: digits only, so +880, spaces and dashes do not matter', () => {
    for (const typed of ['+880 1712-345678', '01712 345678', '০১৭১২৩৪৫৬৭৮', '345678']) {
      const w = orderSearchWhere(typed);
      expect(fields(w), typed).toEqual(['number', 'customerName', 'shipments', 'phone']);
      expect(w.OR![3]).toEqual({ phone: { contains: typed === '+880 1712-345678' ? '8801712345678' : typed === '345678' ? '345678' : '01712345678' } });
    }
  });

  it('a number or a name is not matched against phones; the tracking number drops spaces', () => {
    expect(fields(orderSearchWhere('EX-1001'))).toEqual(['number', 'customerName', 'shipments']);
    expect(fields(orderSearchWhere('Rahim'))).toEqual(['number', 'customerName', 'shipments']);
    expect(orderSearchWhere('trk 140').OR![2]).toEqual({ shipments: { some: { trackingCode: { contains: 'trk140', mode: 'insensitive' } } } });
  });
});
