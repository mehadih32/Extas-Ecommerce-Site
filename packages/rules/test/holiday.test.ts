// S08 · PR 193 — holiday mode, the pure engine (no database; Blueprint B1.14): off and silent as shipped, the notice
// from `showDaysBefore` days before the break, the checkout's "ships from {resume}" only during the break (never the
// usual hours then), and nothing once the break is over. Every date below is a made-up test value.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { formatDay, holidayNotice, holidayPromise, holidayStatus, nextDay, type HolidayConfig, type TextContext } from '../src/pure';

const TZ = 'Asia/Dhaka';
const en: TextContext = { locale: 'en-BD', currency: 'BDT', timeZone: TZ };
const bn: TextContext = { locale: 'bn-BD', currency: 'BDT', timeZone: TZ };
const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00+06:00`);
const shipped = registry['delivery.holiday'].default as HolidayConfig;
const live = (over: Partial<HolidayConfig> = {}): HolidayConfig => ({ ...shipped, enabled: true, from: '2027-04-08', to: '2027-04-11', ...over });

describe('holiday mode (PR 193)', () => {
  it('as shipped: off, no dates, nothing said', () => {
    const s = holidayStatus(shipped, at('2027-04-09'), TZ);
    expect(s).toEqual({ state: 'off' });
    expect(holidayNotice(shipped, s, en)).toBeNull();
    expect(holidayPromise(shipped, s, en)).toBeNull();
  });

  it('switched off with dates set: still nothing', () => {
    expect(holidayStatus(live({ enabled: false }), at('2027-04-09'), TZ).state).toBe('off');
  });

  it('the notice shows from showDaysBefore days before the first day; the usual promise stands until the break', () => {
    const c = live({ showDaysBefore: 3 });
    expect(holidayStatus(c, at('2027-04-04'), TZ).state).toBe('off');
    const ahead = holidayStatus(c, at('2027-04-05'), TZ);
    expect(ahead).toMatchObject({ state: 'ahead', daysLeft: 3, resume: '2027-04-12' });
    expect(holidayNotice(c, ahead, en)).toBe(`We are on a break from ${formatDay('2027-04-08', 'en-BD')} to ${formatDay('2027-04-11', 'en-BD')}. Orders placed in those days ship from ${formatDay('2027-04-12', 'en-BD')}.`);
    expect(holidayPromise(c, ahead, en)).toBeNull();
    expect(holidayStatus(live({ showDaysBefore: 0 }), at('2027-04-07'), TZ).state).toBe('off');
  });

  it('during the break (first to last day, store time zone): the promise is "ships from" the day after, in both languages', () => {
    const c = live();
    for (const day of ['2027-04-08', '2027-04-09', '2027-04-11']) {
      const s = holidayStatus(c, at(day), TZ);
      expect(s.state, day).toBe('on');
      expect(holidayPromise(c, s, en), day).toBe(`We are on a break: your order ships from ${formatDay('2027-04-12', 'en-BD')}.`);
      expect(holidayPromise(c, s, bn), day).toContain(formatDay('2027-04-12', 'bn-BD'));
      expect(holidayPromise(c, s, en), day).not.toMatch(/\{|hour/);
    }
    // 23:30 on the last day in Dhaka is still the break; 00:05 the next day is not
    expect(holidayStatus(c, at('2027-04-11', '23:30'), TZ).state).toBe('on');
    expect(holidayStatus(c, at('2027-04-12', '00:05'), TZ).state).toBe('off');
  });

  it('a one-day break, and a broken range never shows', () => {
    expect(holidayStatus(live({ from: '2027-04-08', to: '2027-04-08' }), at('2027-04-08'), TZ)).toMatchObject({ state: 'on', resume: '2027-04-09' });
    expect(holidayStatus(live({ from: '2027-04-10', to: '2027-04-08' }), at('2027-04-09'), TZ).state).toBe('off');
  });

  it('nextDay crosses months and years', () => {
    expect(nextDay('2027-04-30')).toBe('2027-05-01');
    expect(nextDay('2027-12-31')).toBe('2028-01-01');
  });
});
