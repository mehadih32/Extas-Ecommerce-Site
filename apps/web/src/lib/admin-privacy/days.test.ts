// PR 846 — "days left" for a customer request, and the days-to-answer input the Data & privacy card saves.
import { describe, expect, it } from 'vitest';
import { daysLeft } from './days';
import { parseAnswerDays } from './board';

describe('days left to answer', () => {
  it('counts whole days from the filing', () => {
    expect(daysLeft('2026-11-10T08:00:00Z', '2026-11-12T07:59:00Z', 30)).toBe(29);
    expect(daysLeft('2026-11-10T08:00:00Z', '2026-11-12T08:00:00Z', 30)).toBe(28);
  });
  it('goes negative once the time to answer is over, and never counts a request from the future', () => {
    expect(daysLeft('2026-10-01T00:00:00Z', '2026-11-05T00:00:00Z', 30)).toBe(-5);
    expect(daysLeft('2026-11-20T00:00:00Z', '2026-11-12T00:00:00Z', 30)).toBe(30);
  });
});

describe('answer days input', () => {
  it('takes a whole number from 1 to the bound, or nothing', () => {
    expect(parseAnswerDays(undefined)).toBeNull();
    expect(parseAnswerDays(30)).toBe(30);
    for (const bad of [0, -1, 1.5, 366, '30', null]) expect(() => parseAnswerDays(bad)).toThrow();
  });
});
