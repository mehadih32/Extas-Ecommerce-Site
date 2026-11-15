// PR 840 — the grade a practice customer takes: the highest rule his delivered and refused parcels meet; none when no rule fits.
import { describe, expect, it } from 'vitest';
import { SAMPLE_GRADES, pickGrade, type Level } from './grades';

const levels: Level[] = SAMPLE_GRADES.map((g) => ({ id: g.key, ...g.criteria }));

describe('practice grades', () => {
  it('gives the highest grade the counts earn', () => {
    expect(pickGrade(levels, 0, 0)).toBe('practice-regular');
    expect(pickGrade(levels, 2, 1)).toBe('practice-silver');
    expect(pickGrade(levels, 5, 0)).toBe('practice-gold');
  });
  it('a refusal can keep a customer out of a higher grade', () => {
    expect(pickGrade(levels, 5, 1)).toBe('practice-silver');
    expect(pickGrade(levels, 5, 3)).toBe('practice-regular');
  });
  it('gives none when the shop has no grade or no rule fits', () => {
    expect(pickGrade([], 5, 0)).toBeNull();
    expect(pickGrade([{ id: 'x', minDelivered: 3, minRefused: 0, maxRefused: 0 }], 1, 0)).toBeNull();
  });
  it('the sample grades carry the "practice-" mark the reset looks for', () => {
    expect(SAMPLE_GRADES.every((g) => g.key.startsWith('practice-'))).toBe(true);
  });
});
