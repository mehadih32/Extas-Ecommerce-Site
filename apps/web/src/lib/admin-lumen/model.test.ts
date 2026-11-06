// PR 627 (CN-036) — the Lumen patterns' arithmetic: the count-up lands on the figure, deltas and their tone, the hero
// chart's shape and hover point, and the toast's pause flags (mouse, touch and keyboard each its own, hard rule 7).
import { describe, expect, it } from 'vitest';
import { countAt, deltaOf, deltaTone, easeOut, formatCount, heroShape, NO_PAUSE, pauseAfter, paused, pointAt, pointLeft } from './model';

describe('count-up', () => {
  it('starts at 0, rises, and lands exactly on the figure (a zero length lands at once)', () => {
    expect(countAt(1000, 0, 700)).toBe(0);
    expect(countAt(1000, 350, 700)).toBeGreaterThan(500);
    expect(countAt(1000, 700, 700)).toBe(1000);
    expect(countAt(1000, 9999, 700)).toBe(1000);
    expect(countAt(1234, 0, 0)).toBe(1234);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it('writes numbers with Western digits and the shop grouping, money from minor units', () => {
    expect(formatCount(123456, { kind: 'number', locale: 'en-IN' })).toBe('1,23,456');
    expect(formatCount(123456, { kind: 'number', locale: 'bn-BD' })).toBe('1,23,456');
    expect(formatCount(12345600, { kind: 'money', locale: 'en-IN', currency: 'BDT', digits: 2 })).toBe('৳1,23,456');
    expect(formatCount(0.125, { kind: 'percent', locale: 'en', digits: 1 })).toBe('12.5%');
  });
});

describe('delta against the period before', () => {
  it('is a fraction, null when there is nothing to compare', () => {
    expect(deltaOf(120, 100)).toBeCloseTo(0.2);
    expect(deltaOf(80, 100)).toBeCloseTo(-0.2);
    expect(deltaOf(0, 0)).toBe(0);
    expect(deltaOf(5, 0)).toBeNull();
    expect(deltaOf(5, null)).toBeNull();
    expect(deltaOf(5, undefined)).toBeNull();
  });

  it('is good news up for sales and down for returns', () => {
    expect(deltaTone(0.2)).toBe('ok');
    expect(deltaTone(-0.2)).toBe('bad');
    expect(deltaTone(0.2, 'down')).toBe('bad');
    expect(deltaTone(-0.2, 'down')).toBe('ok');
    expect(deltaTone(null)).toBe('flat');
    expect(deltaTone(0)).toBe('flat');
  });
});

describe('hero chart', () => {
  it('draws the line, its area and the period before on one scale, never below the floor', () => {
    const s = heroShape([0, 10, 5, 20], [5, 5, 5, 5]);
    expect(s.line.startsWith('M0.0,100.0')).toBe(true);
    expect(s.area.endsWith('L1000,100 L0,100 Z')).toBe(true);
    expect(s.prev).toMatch(/^M0\.0,/);
    expect(s.tops).toHaveLength(4);
    expect(Math.min(...s.tops)).toBeGreaterThan(0);
    expect(Math.max(...s.tops)).toBe(100);
    expect(s.max).toBeGreaterThanOrEqual(20);
  });

  it('draws one point as a flat line and an all-zero range on the floor', () => {
    expect(heroShape([7]).line).toMatch(/^M0,[\d.]+ L1000,/);
    expect(heroShape([0, 0, 0]).tops).toEqual([100, 100, 100]);
    expect(heroShape([3, 4]).prev).toBeNull();
  });

  it('finds the point under the pointer and places it', () => {
    expect(pointAt(0, 7)).toBe(0);
    expect(pointAt(1, 7)).toBe(6);
    expect(pointAt(0.5, 7)).toBe(3);
    expect(pointAt(-3, 7)).toBe(0);
    expect(pointAt(9, 7)).toBe(6);
    expect(pointAt(0.7, 1)).toBe(0);
    expect(pointLeft(3, 7)).toBe(50);
    expect(pointLeft(0, 1)).toBe(50);
  });
});

describe('toast pauses (hard rule 7)', () => {
  it('each input sets and clears only its own flag; the clock runs when none holds it', () => {
    let f = pauseAfter(NO_PAUSE, 'mouseenter');
    f = pauseAfter(f, 'focusin');
    expect(paused(f)).toBe(true);
    f = pauseAfter(f, 'mouseleave');
    expect(paused(f)).toBe(true);
    expect(f).toEqual({ mouse: false, touch: false, key: true });
    f = pauseAfter(f, 'focusout');
    expect(paused(f)).toBe(false);
    f = pauseAfter(f, 'touchstart');
    expect(f).toEqual({ mouse: false, touch: true, key: false });
    expect(paused(pauseAfter(f, 'touchend'))).toBe(false);
  });
});
