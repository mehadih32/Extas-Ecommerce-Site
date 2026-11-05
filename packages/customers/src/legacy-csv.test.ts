// PR 535 — reading the old shop's order list (pure). Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { fingerprintOf, guessDelimiter, guessMapping, guessOutcome, legacyHeader, parseLegacyDate, readLegacyFile, statusWords } from './legacy-csv';

// hardcode-ok: made-up test file
const FILE = '﻿Customer Name;Mobile No;Address;Order Date;Total;Status;Invoice\n' + 'Rahim;01700-005351;Mirpur, Dhaka;04/03/2025;"1,250";Delivered;A-1\n' + 'রহিম;০১৭০০০০৫৩৫১;Mirpur;04/03/2025;৳1250/-;Delivered;A-1\n' + 'Karim;12345;Uttara;2025-02-30;900;Returned;A-2\n';
const hints = { fields: { name: ['customer name', 'নাম'], phone: ['mobile', 'phone', 'ফোন'], address: ['address'], orderedAt: ['date'], total: ['total', 'amount'], status: ['status'], ref: ['invoice', 'order no'] }, outcomes: { delivered: ['deliver', 'ডেলিভারি'], returned: ['return', 'ফেরত'], cancelled: ['cancel'] } };

describe('legacy order list (PR 535)', () => {
  it('finds the separator, the columns from the admin words and the status meaning; never guesses one column twice', () => {
    expect(guessDelimiter(FILE)).toBe(';');
    expect(guessDelimiter('a,b\n1,2')).toBe(',');
    expect(guessDelimiter('a\tb')).toBe('\t');
    const header = legacyHeader(FILE);
    expect(guessMapping(header, hints.fields)).toEqual({ phone: 1, name: 0, address: 2, orderedAt: 3, total: 4, status: 5, ref: 6 });
    expect(guessMapping(['Phone', 'Phone 2'], {})).toEqual({ phone: 0, name: null, address: null, orderedAt: null, total: null, status: null, ref: null });
    expect(guessOutcome('Delivered OK', hints.outcomes)).toBe('delivered');
    expect(guessOutcome('ফেরত এসেছে', hints.outcomes)).toBe('returned');
    expect(guessOutcome('pending', hints.outcomes)).toBe('other');
    expect(guessOutcome('Delivered', {})).toBe('other');
    expect(statusWords(FILE, 5)).toEqual([
      { text: 'Delivered', rows: 2 },
      { text: 'Returned', rows: 1 },
    ]);
  });

  it('reads dates day first or month first, ISO always, and refuses a day that does not exist', () => {
    expect(parseLegacyDate('04/03/2025', 'dmy')?.toISOString()).toBe('2025-03-04T12:00:00.000Z');
    expect(parseLegacyDate('04/03/2025', 'mdy')?.toISOString()).toBe('2025-04-03T12:00:00.000Z');
    expect(parseLegacyDate('২০২৫-০৩-০৪ 10:15', 'mdy')?.toISOString()).toBe('2025-03-04T12:00:00.000Z');
    expect(parseLegacyDate('4.3.25', 'dmy')?.toISOString()).toBe('2025-03-04T12:00:00.000Z');
    expect(parseLegacyDate('2025-02-30', 'dmy')).toBeNull();
    expect(parseLegacyDate('last spring', 'dmy')).toBeNull();
  });

  it('reads each row: the number normalised (Bengali digits too), money with its marks, a bad number kept as a problem; the same old order has one fingerprint', () => {
    const mapping = guessMapping(legacyHeader(FILE), hints.fields);
    const { rows } = readLegacyFile(FILE, { mapping, statuses: { Delivered: 'delivered' }, digits: 2, dateOrder: 'dmy' });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ line: 2, phone: '+8801700005351', name: 'Rahim', address: 'Mirpur, Dhaka', ref: 'A-1', totalMinor: 125_000, statusText: 'Delivered', outcome: 'delivered' });
    expect(rows[1]).toMatchObject({ phone: '+8801700005351', totalMinor: 125_000, outcome: 'delivered' });
    expect(rows[1]!.fingerprint).toBe(rows[0]!.fingerprint);
    expect(rows[2]).toMatchObject({ phone: null, phoneRaw: '12345', orderedAt: null, outcome: 'other', fingerprint: '' });
    expect(fingerprintOf('+8801700005351', null, null, null)).toBe('+8801700005351|||');
  });
});
