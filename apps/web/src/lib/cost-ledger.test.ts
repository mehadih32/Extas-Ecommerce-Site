// S16 · PR 343 — the cost ledger's pure parts: today, this month and this year start at the store's own midnight; a CSV
// cell is quoted when it must be and a formula is defused; the export says when it was cut; every word in both languages.
import { describe, expect, it } from 'vitest';
import bn from '../../messages/admin-cost-ledger.bn.json';
import en from '../../messages/admin-cost-ledger.en.json';
import { csvCell, ledgerCsv, periodStarts } from './cost-ledger';

describe('cost ledger (PR 343)', () => {
  it('periods start at local midnight in the store`s time zone', () => {
    // 31 Oct 2026 01:30 in Dhaka (UTC+6) is still 30 Oct in UTC
    const s = periodStarts(new Date('2026-10-30T19:30:00Z'), 'Asia/Dhaka');
    expect(s.today.toISOString()).toBe('2026-10-30T18:00:00.000Z');
    expect(s.month.toISOString()).toBe('2026-09-30T18:00:00.000Z');
    expect(s.year.toISOString()).toBe('2025-12-31T18:00:00.000Z');
  });

  it('a CSV cell: quoted with a comma, quote or line break; a leading = + - @ is defused; null is empty', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell(-35)).toBe('-35');
    expect(csvCell(null)).toBe('');
  });

  it('the export: a header, one line per row, and a closing line when cut', () => {
    const row = { id: 'r1', service: 'SMS', module: 'messages', amountMinor: 35, currency: 'BDT', refType: 'notification', refId: 'n1', detail: 'placed · bulkSmsBd', source: 'system', occurredAt: new Date('2026-10-31T00:00:00Z') };
    const whole = ledgerCsv([row], false).split('\r\n');
    expect(whole[0]).toBe('occurredAt,service,module,amountMinor,currency,refType,refId,detail,source,id');
    expect(whole[1]).toBe('2026-10-31T00:00:00.000Z,SMS,messages,35,BDT,notification,n1,placed · bulkSmsBd,system,r1');
    expect(whole).toHaveLength(3);
    expect(ledgerCsv([row], true)).toContain('# cut at 1 rows');
  });

  it('every word in both languages, with the same keys', () => {
    const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});
