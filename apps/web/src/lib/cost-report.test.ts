// S16 · PR 347 — the Costs report's period rules without a database: one-press periods from the store's own today,
// a period never past today, turned round when reversed, cut to `maxDays`, "by day" over `maxDayRows` shown by month;
// unknown grouping falls back to service; the CSV defuses spreadsheet formulas and ends with the total.
import { describe, expect, it } from 'vitest';
import { parseReportQuery, quickPeriod, reportCsv, reportFileName } from './cost-report';

const limits = { maxDays: 400, maxDayRows: 92 };
const today = '2026-11-01';

describe('cost report periods (PR 347)', () => {
  it('one-press periods', () => {
    expect(quickPeriod('today', today)).toEqual({ from: today, to: today });
    expect(quickPeriod('week', today)).toEqual({ from: '2026-10-26', to: today });
    expect(quickPeriod('month', today)).toEqual({ from: '2026-11-01', to: today });
    expect(quickPeriod('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(quickPeriod('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(quickPeriod('year', today)).toEqual({ from: '2026-01-01', to: today });
    expect(quickPeriod('lastYear', today)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('defaults to this month by day and by service', () => {
    expect(parseReportQuery({}, today, limits)).toEqual({ q: { from: '2026-11-01', to: today, by: 'day', group: 'service' }, notes: [] });
    expect(parseReportQuery({ by: 'week', group: 'colour', from: '2026-02-30' }, today, limits).q).toEqual({ from: '2026-11-01', to: today, by: 'day', group: 'service' });
  });

  it('a period wins over from/to; never past today; reversed turned round', () => {
    expect(parseReportQuery({ period: 'lastMonth', from: '2020-01-01', by: 'month', group: 'module' }, today, limits).q).toEqual({ from: '2026-10-01', to: '2026-10-31', by: 'month', group: 'module' });
    expect(parseReportQuery({ from: '2026-10-20', to: '2026-12-31' }, today, limits)).toEqual({ q: { from: '2026-10-20', to: today, by: 'day', group: 'service' }, notes: ['future'] });
    expect(parseReportQuery({ from: '2026-10-20', to: '2026-10-10' }, today, limits)).toEqual({ q: { from: '2026-10-10', to: '2026-10-20', by: 'day', group: 'service' }, notes: ['swapped'] });
  });

  it('cut to maxDays; by day over maxDayRows is shown by month', () => {
    const long = parseReportQuery({ from: '2020-01-01', to: '2026-10-31', by: 'year' }, today, limits);
    expect(long.q.from).toBe('2025-09-27');
    expect(long.q.by).toBe('year');
    expect(long.notes).toEqual(['tooLong']);
    const days = parseReportQuery({ from: '2026-01-01', to: '2026-10-31', by: 'day' }, today, limits);
    expect(days.q.by).toBe('month');
    expect(days.notes).toEqual(['byMonth']);
    expect(parseReportQuery({ from: '2026-08-01', to: '2026-10-31', by: 'day' }, today, limits).q.by).toBe('day');
  });

  it('the CSV: oldest period first, formulas defused, the total last; its file name', () => {
    const q = { from: '2026-10-01', to: '2026-10-31', by: 'month' as const, group: 'module' as const };
    const csv = reportCsv(
      {
        query: q,
        total: { minor: 30, count: 3 },
        groups: [],
        buckets: [
          { bucket: '2026-10', minor: 20, count: 2, parts: [{ key: '=cmd', minor: 20, count: 2 }] },
          { bucket: '2026-09', minor: 10, count: 1, parts: [{ key: '', minor: 10, count: 1 }] },
        ],
      },
      'BDT',
    );
    expect(csv.split('\r\n')).toEqual(['period,module,amountMinor,currency,rows', '2026-09,,10,BDT,1', "2026-10,'=cmd,20,BDT,2", 'total,,30,BDT,3', '']);
    expect(reportFileName(q)).toBe('costs-by-month-module-2026-10-01-2026-10-31.csv');
  });
});
