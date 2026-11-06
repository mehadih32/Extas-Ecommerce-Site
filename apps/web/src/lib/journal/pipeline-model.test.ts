// S12 · PR 591 — the pipeline's arithmetic: health, the pace of a day (3 for two weeks, then 5 only while healthy), the
// buffer, the next step, stuck articles and refresh.
import { describe, expect, it } from 'vitest';
import { BLOG_PIPELINE_DEFAULT } from '@extas/settings';
import { addDay, daysBetween, healthOf, isStuck, nextStep, paceFor, refreshDue, supplyOf } from './pipeline-model';

const P = { ...BLOG_PIPELINE_DEFAULT, on: true };
const SCH = { perDayMin: 3, perDayTarget: 5, perDayMax: 6 };
const OK = { healthy: true };

describe('health', () => {
  it('counts the share sent back and waits for indexing while asked to', () => {
    expect(healthOf({ passes: 9, backs: 1, indexedPct: 80 }, P)).toEqual({ backPct: 10, quality: 'ok', indexing: 'ok', healthy: true });
    expect(healthOf({ passes: 6, backs: 4, indexedPct: 80 }, P).quality).toBe('low');
    expect(healthOf({ passes: 6, backs: 4, indexedPct: 80 }, P).healthy).toBe(false);
    // Search Console not there yet: unknown, and with waitForIndexing on that is not healthy (the safe side)
    expect(healthOf({ passes: 9, backs: 1, indexedPct: null }, P)).toMatchObject({ indexing: 'unknown', healthy: false });
    expect(healthOf({ passes: 9, backs: 1, indexedPct: 50 }, P)).toMatchObject({ indexing: 'low', healthy: false });
    expect(healthOf({ passes: 9, backs: 1, indexedPct: null }, { ...P, waitForIndexing: false })).toMatchObject({ indexing: 'skipped', healthy: true });
    // no review answers yet is not held against the journal
    expect(healthOf({ passes: 0, backs: 0, indexedPct: null }, { ...P, waitForIndexing: false })).toEqual({ backPct: null, quality: 'none', indexing: 'skipped', healthy: true });
  });
});

describe('pace', () => {
  it('is the calendar’s own target while the pipeline is off', () => {
    expect(paceFor('2026-11-06', '2026-10-01', OK, { ...P, on: false }, SCH)).toEqual({ perDay: 5, reason: 'off', fullFrom: null });
  });
  it('starts at 3 a day, goes to 5 after rampDays from the first live day, and drops back to 3 when not healthy', () => {
    expect(paceFor('2026-11-06', null, OK, P, SCH)).toMatchObject({ perDay: 3, reason: 'notStarted' });
    expect(paceFor('2026-11-14', '2026-11-01', OK, P, SCH)).toMatchObject({ perDay: 3, reason: 'starting', fullFrom: '2026-11-15' });
    expect(paceFor('2026-11-15', '2026-11-01', OK, P, SCH)).toMatchObject({ perDay: 5, reason: 'full' });
    expect(paceFor('2026-11-20', '2026-11-01', { healthy: false }, P, SCH)).toMatchObject({ perDay: 3, reason: 'held' });
  });
  it('stays inside the calendar’s least and most a day', () => {
    expect(paceFor('2026-12-01', '2026-11-01', OK, { ...P, startPerDay: 1, fullPerDay: 9 }, SCH).perDay).toBe(6);
    expect(paceFor('2026-11-02', '2026-11-01', OK, { ...P, startPerDay: 1, fullPerDay: 9 }, SCH).perDay).toBe(3);
  });
  it('works in whole shop days', () => {
    expect(daysBetween('2026-11-01', '2026-11-15')).toBe(14);
    expect(addDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('queue', () => {
  it('measures the buffer in days at the pace', () => {
    expect(supplyOf(4, 5, 3, 3)).toEqual({ have: 9, want: 9, days: 3, short: 0 });
    expect(supplyOf(1, 2, 5, 3)).toEqual({ have: 3, want: 15, days: 0, short: 12 });
  });
  it('names the step an article waits for', () => {
    expect(nextStep('IDEA')).toBe('writing');
    expect(nextStep('DRAFT')).toBe('proofread');
    expect(nextStep('PROOFREAD')).toBe('facts');
    expect(nextStep('FACT_CHECKED')).toBe('seo');
    expect(nextStep('SEO_CHECKED')).toBeNull();
    expect(nextStep('PUBLISHED')).toBeNull();
  });
  it('flags a stuck article and a live article due a refresh', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    expect(isStuck(new Date('2026-11-03T12:00:00Z'), now, 3)).toBe(true);
    expect(isStuck(new Date('2026-11-04T12:00:00Z'), now, 3)).toBe(false);
    expect(refreshDue({ publishedAt: new Date('2026-01-01T00:00:00Z'), contentUpdatedAt: null }, now, 180)).toBeGreaterThanOrEqual(180);
    expect(refreshDue({ publishedAt: new Date('2026-01-01T00:00:00Z'), contentUpdatedAt: new Date('2026-10-01T00:00:00Z') }, now, 180)).toBeNull();
    expect(refreshDue({ publishedAt: null, contentUpdatedAt: null }, now, 180)).toBeNull();
  });
});
