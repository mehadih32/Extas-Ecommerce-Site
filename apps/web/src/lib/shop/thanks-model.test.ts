// Follow-up 58 — "What happens next": placed is done, we confirm and pack is next, the delivered step carries the
// band's promise; the time is the store's, in the page's digits.
import { describe, expect, it } from 'vitest';
import { dayText, nextSteps, placedText } from './thanks-model';

const words = { placed: 'Order placed', confirm: 'We confirm and pack it', courier: 'Handed to the courier', delivered: 'Delivered' };

describe('PR 605 · a gift\'s day', () => {
  it('is written as the day it is, whatever the time zone, in the page\'s digits', () => {
    expect(dayText('2026-11-02', 'en', false)).toBe('2 Nov 2026');
    expect(dayText('2026-11-02', 'bn', true)).toMatch(/২/);
    expect(dayText('not a day', 'en', false)).toBe('not a day');
  });
});

describe('what happens next', () => {
  it('only the first step is done, the second is the one now', () => {
    const s = nextSteps(words, '23 Oct, 10:30 am', 'You will get your order within 24–48 hours');
    expect(s.map((x) => x.state)).toEqual(['done', 'now', 'later', 'later']);
    expect(s[0]!.note).toBe('23 Oct, 10:30 am');
    expect(s[3]!.note).toBe('You will get your order within 24–48 hours');
    expect(s.slice(1, 3).every((x) => x.note === null)).toBe(true);
  });

  it('the time is the store`s own, in Bengali digits only when the page uses them', () => {
    const iso = '2026-10-23T04:30:00.000Z';
    expect(placedText(iso, 'Asia/Dhaka', 'en', false)).toMatch(/23 Oct.*10:30/);
    expect(placedText(iso, 'Asia/Dhaka', 'bn', true)).toMatch(/২৩/);
    expect(placedText(iso, 'Asia/Dhaka', 'bn', false)).toMatch(/23/);
    expect(placedText('not a date', 'Asia/Dhaka', 'en', false)).toBe('');
  });
});
