// S29 · PR 752 — the query of Reports › Geography map without a database: period presets, the longest report from
// `costs.report`, never past today, a reversed period turned round, the compare modes and their days, ids kept only when
// they are ids, the setting's opening choices when nothing is asked.
import { describe, expect, it } from 'vitest';
import { parseGeoMapQuery, periodDays, sixMonthsFrom } from './query';

const TODAY = '2026-11-16';
const LIMITS = { maxDays: 1_830, maxDayRows: 92 };
const DEFAULTS = { defaultPeriod: 'month', compareDefault: false } as const;
const ID = '0190aaaa-bbbb-7ccc-8ddd-eeeeffff0001';

describe('period presets', () => {
  it('day, month, six months, year and a custom range', () => {
    expect(periodDays('day', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(periodDays('day', TODAY, '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(periodDays('month', TODAY)).toEqual({ from: '2026-11-01', to: TODAY });
    expect(periodDays('sixMonths', TODAY)).toEqual({ from: '2026-05-17', to: TODAY });
    expect(periodDays('year', TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
    expect(periodDays('custom', TODAY, '2026-10-01', '2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('six months back from a 31st lands on the shorter month’s last day, then one day on', () => {
    expect(sixMonthsFrom('2026-08-31')).toBe('2026-03-01'); // 28 Feb + 1
    expect(sixMonthsFrom('2026-01-31')).toBe('2025-08-01'); // 31 Jul + 1 day
  });
});

describe('the query', () => {
  it('opens on the setting’s period and no compare when nothing is asked', () => {
    const q = parseGeoMapQuery({}, TODAY, LIMITS, DEFAULTS);
    expect(q).toMatchObject({ period: 'month', days: { from: '2026-11-01', to: TODAY }, level: 'district', parentAreaId: null, compare: 'off', compareDays: null, categoryId: null, productId: null, notes: [] });
    const y = parseGeoMapQuery({}, TODAY, LIMITS, { defaultPeriod: 'year', compareDefault: true });
    expect(y.period).toBe('year');
    expect(y.compare).toBe('previous');
  });

  it('takes a preset, a level, a parent and ids; drops what is not an id or a known word', () => {
    const q = parseGeoMapQuery({ period: 'sixMonths', level: 'upazila', parent: ID.toUpperCase(), category: ID, product: 'x', compare: 'lastYear' }, TODAY, LIMITS, DEFAULTS);
    expect(q).toMatchObject({ period: 'sixMonths', level: 'upazila', parentAreaId: ID, categoryId: ID, productId: null, compare: 'lastYear' });
    const bad = parseGeoMapQuery({ period: 'decade', level: 'planet', compare: 'sometimes', parent: 'nope' }, TODAY, LIMITS, DEFAULTS);
    expect(bad).toMatchObject({ period: 'month', level: 'district', compare: 'off', parentAreaId: null });
  });

  it('a from and a to without a period are a custom range; a reversed one is turned round, the future cut', () => {
    const q = parseGeoMapQuery({ from: '2026-10-31', to: '2026-10-01' }, TODAY, LIMITS, DEFAULTS);
    expect(q.period).toBe('custom');
    expect(q.days).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(q.notes).toContain('swapped');
    const f = parseGeoMapQuery({ period: 'custom', from: '2026-11-10', to: '2027-01-01' }, TODAY, LIMITS, DEFAULTS);
    expect(f.days.to).toBe(TODAY);
    expect(f.notes).toContain('future');
  });

  it('never longer than the Costs report limit', () => {
    const q = parseGeoMapQuery({ period: 'custom', from: '2020-01-01', to: TODAY }, TODAY, { maxDays: 30, maxDayRows: 92 }, DEFAULTS);
    expect(q.days).toEqual({ from: '2026-10-18', to: TODAY });
    expect(q.notes).toContain('tooLong');
  });

  it('compare custom needs two good days, else it falls back to the previous period and says so', () => {
    const ok = parseGeoMapQuery({ compare: 'custom', cfrom: '2026-05-10', cto: '2026-05-01' }, TODAY, LIMITS, DEFAULTS);
    expect(ok).toMatchObject({ compare: 'custom', compareDays: { from: '2026-05-01', to: '2026-05-10' } });
    const bad = parseGeoMapQuery({ compare: 'custom', cfrom: 'May' }, TODAY, LIMITS, DEFAULTS);
    expect(bad).toMatchObject({ compare: 'previous', compareDays: null });
    expect(bad.notes).toContain('badCompare');
    const future = parseGeoMapQuery({ compare: 'custom', cfrom: '2026-11-10', cto: '2027-02-01' }, TODAY, LIMITS, DEFAULTS);
    expect(future.compareDays).toEqual({ from: '2026-11-10', to: TODAY });
  });
});
