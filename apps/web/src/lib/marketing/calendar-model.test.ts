// S13 · PR 282 — the marketing calendar's pure parts: days on the shop's clock, the view, what falls in it, bars and marks,
// the header's month marks, the day-by-day order and the owner's plan line as typed.
import { describe, expect, it } from 'vitest';
import { addDays, agendaOrder, barOf, calendarRange, dayAt, dayOf, inRange, markAt, monthMarks, planInput, stateByDays, type CalendarItem } from './calendar-model';

const item = (o: Partial<CalendarItem>): CalendarItem => ({ id: 'x', lane: 'campaign', title: { en: 'X', bn: null }, starts: '2027-03-01', ends: null, open: false, state: 'live', detail: null, href: null, ...o });

describe('marketing calendar model (PR 282)', () => {
  it('reads real days only and finds the day on the shop clock', () => {
    expect(dayOf('2027-02-28')).toBe('2027-02-28');
    for (const bad of ['2027-02-29', '2027-13-01', '27-01-01', '', null, 5]) expect(dayOf(bad)).toBeNull();
    // 20:30 UTC on 1 Mar is 02:30 on 2 Mar in Dhaka
    expect(dayAt(new Date('2027-03-01T20:30:00Z'), 'Asia/Dhaka')).toBe('2027-03-02');
    expect(addDays('2027-02-27', 3)).toBe('2027-03-02');
  });

  it('builds the view from today or from an asked real day', () => {
    expect(calendarRange('2027-03-01', 60)).toEqual({ from: '2027-03-01', to: '2027-04-29', days: 60 });
    expect(calendarRange('2027-03-01', 7, '2027-04-10')).toEqual({ from: '2027-04-10', to: '2027-04-16', days: 7 });
    expect(calendarRange('2027-03-01', 7, 'soon').from).toBe('2027-03-01');
  });

  it('keeps what touches the view, with bars clipped to it and an open item running to its end', () => {
    const r = calendarRange('2027-03-01', 10);
    expect(inRange(item({ starts: '2027-02-20', ends: '2027-02-28' }), r)).toBe(false);
    expect(inRange(item({ starts: '2027-02-20', ends: '2027-03-01' }), r)).toBe(true);
    expect(inRange(item({ starts: '2027-02-20', open: true }), r)).toBe(true);
    expect(inRange(item({ starts: '2027-03-11' }), r)).toBe(false);
    expect(inRange(item({ starts: '2027-02-01', ends: '2027-03-20', marks: [{ day: '2027-02-01', label: 'a' }, { day: '2027-03-20', label: 'b' }] }), r)).toBe(false);
    expect(barOf(item({ starts: '2027-02-20', ends: '2027-03-02' }), r)).toEqual({ left: 0, width: 20 });
    expect(barOf(item({ starts: '2027-03-06', open: true }), r)).toEqual({ left: 50, width: 50 });
    expect(barOf(item({ starts: '2027-03-10' }), r)).toEqual({ left: 90, width: 10 });
    expect(markAt('2027-03-03', r)).toBe(20);
    expect(markAt('2027-03-11', r)).toBeNull();
  });

  it('marks the first day and each first of the month', () => {
    expect(monthMarks(calendarRange('2027-03-25', 40))).toEqual([
      { day: '2027-03-25', left: 0 },
      { day: '2027-04-01', left: 17.5 },
      { day: '2027-05-01', left: 92.5 },
    ]);
  });

  it('orders the list by first day in view, then lane, then title; states by days', () => {
    const r = calendarRange('2027-03-01', 30);
    const list = [item({ id: 'b', lane: 'social', starts: '2027-03-05' }), item({ id: 'a', lane: 'plan', starts: '2027-03-05' }), item({ id: 'c', starts: '2027-02-01', open: true }), item({ id: 'd', lane: 'festive', starts: '2027-02-27', marks: [{ day: '2027-02-27', label: 'x' }, { day: '2027-03-03', label: 'y' }] })];
    expect(list.sort(agendaOrder(r)).map((i) => i.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(stateByDays('2027-03-02', null, '2027-03-01')).toBe('scheduled');
    expect(stateByDays('2027-02-01', '2027-02-28', '2027-03-01')).toBe('ended');
    expect(stateByDays('2027-02-01', null, '2027-03-01')).toBe('live');
  });

  it('takes a plan line with a title, a start and an end on or after it, and names every wrong field', () => {
    expect(planInput({ title: ' Eid ', titleBn: 'ঈদ', starts: '2027-03-08', ends: '2027-03-12', note: '' })).toEqual({ ok: true, value: { title: 'Eid', titleBn: 'ঈদ', starts: '2027-03-08', ends: '2027-03-12', note: null } });
    // one day: an end on the same day is no end
    expect(planInput({ title: 'Pohela Boishakh', starts: '2027-04-14', ends: '2027-04-14' })).toMatchObject({ ok: true, value: { ends: null, titleBn: null } });
    expect(planInput({ title: '', titleBn: 5, starts: '2027-02-30', ends: 'soon', note: 'x'.repeat(281) })).toEqual({ ok: false, bad: ['title', 'titleBn', 'starts', 'ends', 'note'] });
    expect(planInput({ title: 'Winter', starts: '2027-03-08', ends: '2027-03-01' })).toEqual({ ok: false, bad: ['ends'] });
    expect(planInput({ title: 'Typo', starts: '2027-03-08', ends: '2207-03-01' })).toEqual({ ok: false, bad: ['ends'] });
  });
});
