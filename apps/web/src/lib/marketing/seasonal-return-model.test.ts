// S12 · PR 530 — the yearly return's arithmetic: this year's dates and "every year" dates (across the new year, 29
// February), the window widened by the days before and after, and where a page stands (never live, put away, live by
// hand, not ticked, something missing, no dates, switch off, back now, coming back). Every date is made up.
import { describe, expect, it } from 'vitest';
import { SEASONAL_RETURN_DEFAULT, type SeasonalReturnSettings } from '@extas/settings';
import { isBack, nextSpan, occasionSpans, returnStatus, returnsOf, spanNow, type ReturnPage } from './seasonal-return-model';
import { seasonalServe } from './seasonal-model';

const set = (p: Partial<SeasonalReturnSettings> = {}): SeasonalReturnSettings => ({
  ...SEASONAL_RETURN_DEFAULT,
  on: true,
  leadDays: 10,
  afterDays: 2,
  dates: [
    { occasion: 'eid', from: '2027-03-09', to: '2027-03-11', yearly: false },
    { occasion: 'winter', from: '2026-12-01', to: '2027-02-15', yearly: true },
  ],
  ...p,
});
const page = (p: Partial<ReturnPage> = {}): ReturnPage => ({ status: 'UNPUBLISHED', archivedAt: null, publishedAt: new Date('2026-04-01T00:00:00Z'), occasion: 'eid', returns: true, ready: true, ...p });

describe('occasion dates', () => {
  it('keeps this year’s dates as they are and repeats "every year" dates around today, across the new year', () => {
    expect(occasionSpans('eid', set(), '2027-01-05')).toEqual([{ from: '2027-03-09', to: '2027-03-11' }]);
    expect(occasionSpans('winter', set(), '2027-01-05')).toEqual([
      { from: '2026-12-01', to: '2027-02-15' },
      { from: '2027-12-01', to: '2028-02-15' },
      { from: '2028-12-01', to: '2029-02-15' },
    ]);
    expect(occasionSpans('puja', set(), '2027-01-05')).toEqual([]);
  });

  it('reads 29 February as the 28th in a common year', () => {
    const s = set({ dates: [{ occasion: 'leap', from: '2028-02-29', to: '2028-03-01', yearly: true }] });
    expect(occasionSpans('leap', s, '2027-06-01').map((x) => x.from)).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('widens each window by the days before and after; finds the one today is in and the next', () => {
    expect(spanNow('eid', set(), '2027-02-26')).toBeNull();
    expect(spanNow('eid', set(), '2027-02-27')).toMatchObject({ from: '2027-02-27', to: '2027-03-13', occasionFrom: '2027-03-09', occasionTo: '2027-03-11' });
    expect(spanNow('eid', set(), '2027-03-13')).not.toBeNull();
    expect(spanNow('eid', set(), '2027-03-14')).toBeNull();
    expect(nextSpan('eid', set(), '2027-01-01')?.from).toBe('2027-02-27');
    expect(nextSpan('eid', set(), '2027-03-14')).toBeNull();
    expect(spanNow('winter', set(), '2027-01-20')?.to).toBe('2027-02-17');
    expect(nextSpan('winter', set(), '2027-06-01')?.from).toBe('2027-11-21');
    expect(spanNow(null, set(), '2027-03-10')).toBeNull();
  });
});

describe('where a page stands', () => {
  const at = (p: Partial<ReturnPage>, s = set(), today = '2027-03-01') => returnStatus(page(p), s, today).status;
  it('comes back only when ticked, live once, taken down, ready, inside its window and with the switch on', () => {
    expect(at({})).toBe('back');
    expect(at({}, set(), '2027-01-10')).toBe('waiting');
    expect(at({}, set({ on: false }))).toBe('switchOff');
    expect(at({ returns: false })).toBe('notTicked');
    expect(at({ ready: false })).toBe('notReady');
    expect(at({ publishedAt: null, status: 'DRAFT' })).toBe('neverLive');
    expect(at({ status: 'ARCHIVED', archivedAt: new Date() })).toBe('archived');
    expect(at({ status: 'PUBLISHED' })).toBe('live');
    expect(at({ occasion: 'puja' })).toBe('noDates');
    expect(at({}, set(), '2027-04-01')).toBe('noDates');
    expect(isBack(page(), set({ on: false }), '2027-03-01')).toBe(false);
    expect(isBack(page(), set(), '2027-03-01')).toBe(true);
  });

  it('serves a returned page live on the shop, never a put-away one', () => {
    const p = { status: 'UNPUBLISHED', archivedAt: null, publishedAt: new Date() };
    expect(seasonalServe(p, { enabled: true, offSeason: true }, true)).toBe('live');
    expect(seasonalServe(p, { enabled: true, offSeason: true }, false)).toBe('resting');
    expect(seasonalServe({ ...p, archivedAt: new Date() }, { enabled: true, offSeason: true }, true)).toBe('resting');
    expect(seasonalServe(p, { enabled: false, offSeason: true }, true)).toBeNull();
  });

  it('reads the tick from Page.recurrence', () => {
    expect(returnsOf({ occasion: 'eid', returns: true })).toBe(true);
    expect(returnsOf({ occasion: 'eid' })).toBe(false);
    expect(returnsOf(null)).toBe(false);
    expect(returnsOf({ returns: 'yes' })).toBe(false);
  });
});
