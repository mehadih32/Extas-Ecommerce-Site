// PR 58 — the steppers' press and hold: a tap steps once, a held press repeats until it is let go (each way of letting
// go is its own resume path), the click after a hold is not an extra step, the keyboard steps once, and the repeat stops
// by itself at the end of the range.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdRepeat } from './hold-repeat';

describe('holdRepeat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (limit = Infinity) => {
    let n = 0;
    const h = holdRepeat({ holdMs: 450, repeatMs: 90, step: () => (n < limit ? (n++, true) : false) });
    return { h, steps: () => n };
  };

  it('a short press (mouse or finger) and its click step exactly once', () => {
    const { h, steps } = make();
    h.press();
    vi.advanceTimersByTime(200);
    h.release();
    h.click();
    expect(steps()).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(steps()).toBe(1);
  });

  it('the keyboard (a click with no press) steps once each time', () => {
    const { h, steps } = make();
    h.click();
    h.click();
    expect(steps()).toBe(2);
  });

  it('a held press steps at the hold, then every repeat, and stops the moment it is let go; the click after is swallowed', () => {
    const { h, steps } = make();
    h.press();
    vi.advanceTimersByTime(449);
    expect(steps()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(steps()).toBe(1);
    expect(h.repeating()).toBe(true);
    vi.advanceTimersByTime(90 * 5);
    expect(steps()).toBe(6);
    h.release();
    expect(h.repeating()).toBe(false);
    h.click();
    vi.advanceTimersByTime(1000);
    expect(steps()).toBe(6);
    // the next tap is a normal tap again
    h.press();
    h.release();
    h.click();
    expect(steps()).toBe(7);
  });

  it('a press released between the hold and the first repeat still counts the one step the hold made', () => {
    const { h, steps } = make();
    h.press();
    vi.advanceTimersByTime(470);
    h.release();
    h.click();
    expect(steps()).toBe(1);
  });

  it('the pointer leaving or the press being cancelled stops it too, and the next keyboard click is not swallowed', () => {
    const { h, steps } = make();
    h.press();
    vi.advanceTimersByTime(600);
    const at = steps();
    h.cancel();
    vi.advanceTimersByTime(1000);
    expect(steps()).toBe(at);
    h.click();
    expect(steps()).toBe(at + 1);
  });

  it('the repeat stops by itself when the value cannot move any more', () => {
    const { h, steps } = make(3);
    h.press();
    vi.advanceTimersByTime(5000);
    expect(steps()).toBe(3);
    expect(h.repeating()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
