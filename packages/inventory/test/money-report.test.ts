// S16 · PR 351 — the money report to the owner, without a database: off sends nothing; daily from the time set to the
// end of that store day; weekly on its weekday for the last 7 days; monthly on its day for the month before; one key per
// period; the words carry Sales (delivered) with Ordered value beside it and say "not known" instead of a made-up 0.
import { describe, expect, it } from 'vitest';
import type { MoneyReportSettings } from '@extas/settings';
import { localClock, moneyReportDue, moneyReportNextDay, moneyReportPreview, moneyReportText, moneyText, type ProfitReport } from '../src/index';

const TZ = 'Asia/Dhaka';
const s: MoneyReportSettings = { enabled: true, frequency: 'daily', at: '22:00', weekday: 6, monthDay: 1, lang: 'bn' };
// 2026-11-07 is a Saturday; Dhaka is UTC+6.
const dhaka = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00+06:00`);

describe('PR 351 · when the money report is due', () => {
  it('reads the store clock', () => {
    expect(localClock(dhaka('2026-11-07', '22:30'), TZ)).toEqual({ day: '2026-11-07', minutes: 22 * 60 + 30, weekday: 6 });
    expect(localClock(new Date('2026-11-07T18:30:00Z'), TZ).day).toBe('2026-11-08'); // 00:30 the next day in Dhaka
  });

  it('off sends nothing; daily from the time set to the end of the day, one key per day', () => {
    expect(moneyReportDue(dhaka('2026-11-07', '23:00'), TZ, { ...s, enabled: false })).toBeNull();
    expect(moneyReportDue(dhaka('2026-11-07', '21:59'), TZ, s)).toBeNull();
    expect(moneyReportDue(dhaka('2026-11-07', '22:00'), TZ, s)).toEqual({ key: 'D:2026-11-07', from: '2026-11-07', to: '2026-11-07' });
    expect(moneyReportDue(dhaka('2026-11-07', '23:59'), TZ, s)?.key).toBe('D:2026-11-07');
    expect(moneyReportDue(dhaka('2026-11-08', '00:10'), TZ, s)).toBeNull();
  });

  it('weekly on its weekday for the last 7 days; monthly on its day for the month before', () => {
    const weekly = { ...s, frequency: 'weekly' as const };
    expect(moneyReportDue(dhaka('2026-11-07', '22:05'), TZ, weekly)).toEqual({ key: 'W:2026-11-07', from: '2026-11-01', to: '2026-11-07' });
    expect(moneyReportDue(dhaka('2026-11-06', '22:05'), TZ, weekly)).toBeNull();
    const monthly = { ...s, frequency: 'monthly' as const, at: '09:00' };
    expect(moneyReportDue(dhaka('2026-11-01', '09:00'), TZ, monthly)).toEqual({ key: 'M:2026-10', from: '2026-10-01', to: '2026-10-31' });
    expect(moneyReportDue(dhaka('2026-03-01', '10:00'), TZ, monthly)).toEqual({ key: 'M:2026-02', from: '2026-02-01', to: '2026-02-28' });
    expect(moneyReportDue(dhaka('2026-11-02', '09:00'), TZ, monthly)).toBeNull();
  });
});

describe('PR 351 · the preview and the next report day', () => {
  it('the preview period for any day; the next day the report goes', () => {
    expect(moneyReportPreview(dhaka('2026-11-05', '08:00'), TZ, { frequency: 'weekly' })).toMatchObject({ from: '2026-10-30', to: '2026-11-05' });
    expect(moneyReportPreview(dhaka('2026-11-05', '08:00'), TZ, { frequency: 'monthly' })).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(moneyReportNextDay(dhaka('2026-11-05', '08:00'), TZ, { ...s, enabled: false })).toBeNull();
    expect(moneyReportNextDay(dhaka('2026-11-05', '21:00'), TZ, s)).toBe('2026-11-05');
    expect(moneyReportNextDay(dhaka('2026-11-05', '22:00'), TZ, s)).toBe('2026-11-06');
    expect(moneyReportNextDay(dhaka('2026-11-05', '08:00'), TZ, { ...s, frequency: 'weekly' })).toBe('2026-11-07');
    expect(moneyReportNextDay(dhaka('2026-11-07', '23:00'), TZ, { ...s, frequency: 'weekly' })).toBe('2026-11-14');
    expect(moneyReportNextDay(dhaka('2026-11-05', '08:00'), TZ, { ...s, frequency: 'monthly', monthDay: 28 })).toBe('2026-11-28');
    expect(moneyReportNextDay(dhaka('2026-11-28', '23:00'), TZ, { ...s, frequency: 'monthly', monthDay: 28 })).toBe('2026-12-28');
  });
});

describe('PR 351 · the words of the money report', () => {
  const r = {
    from: '2026-11-07',
    to: '2026-11-07',
    orders: 3,
    costedOrders: 2,
    uncosted: { orders: 1, salesMinor: 20_000, skus: ['CAP-1'] },
    salesMinor: 200_000,
    orderedMinor: 350_050,
    grossProfitMinor: 70_000,
    contributionMinor: 60_000,
    adsMinor: null,
    adsImported: true,
    fixedMinor: null,
    netProfitMinor: null,
  } as unknown as ProfitReport;

  it('Sales first with Ordered value beside it; unknown figures said, never 0', () => {
    const en = moneyReportText(r, r, 'en', 'BDT').split('\n');
    expect(en[0]).toBe('Money report · 2026-11-07');
    expect(en[1]).toBe('Sales (delivered): 2,000 BDT · orders: 3');
    expect(en[2]).toBe('Ordered value: 3,500.5 BDT');
    expect(en).toContain('Ad spend: not known yet');
    expect(en).toContain('Fixed costs: no fixed costs entered');
    expect(en).toContain('Net profit: not known yet');
    expect(en).toContain('Delivered orders without a product cost yet (left out of profit): 1');
    const bn = moneyReportText(r, { from: '2026-11-01', to: '2026-11-07' }, 'bn', 'BDT');
    expect(bn.split('\n')[0]).toBe('টাকার রিপোর্ট · 2026-11-01 – 2026-11-07');
    expect(bn).toContain('বিক্রি (ডেলিভারি হওয়া): 2,000 BDT · 3টা অর্ডার');
  });

  it('amounts in the currency’s own minor digits, Western digits', () => {
    expect(moneyText(123_456, 'BDT')).toBe('1,234.56 BDT');
    expect(moneyText(-5_000, 'BDT')).toBe('-50 BDT');
    expect(moneyText(1_000, 'JPY')).toBe('1,000 JPY');
  });
});
