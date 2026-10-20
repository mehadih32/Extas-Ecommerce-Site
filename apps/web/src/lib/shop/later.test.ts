// PR 42 — the TBT budget's scheduler: jobs wait for the first paint, each runs in a task of its own, a cancel stops the
// rest, and a part of the page out of sight is done when it comes near or the page is idle, once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterPaint, series, whenIdle, whenNear } from './later';

const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let frames: Array<(t: number) => void> = [];
let observers: Array<{ cb: (es: Array<{ isIntersecting: boolean }>) => void; off: boolean; margin?: string }> = [];

function paint() {
  const due = frames;
  frames = [];
  due.forEach((f) => f(0));
}

beforeEach(() => {
  vi.useFakeTimers();
  frames = [];
  observers = [];
  for (const k of ['requestAnimationFrame', 'cancelAnimationFrame', 'IntersectionObserver', 'requestIdleCallback']) saved[k] = g[k];
  g.requestAnimationFrame = (fn: (t: number) => void) => frames.push(fn);
  g.cancelAnimationFrame = (id: number) => {
    frames[id - 1] = () => undefined;
  };
  g.IntersectionObserver = class {
    o: (typeof observers)[number];
    constructor(cb: (es: Array<{ isIntersecting: boolean }>) => void, opts?: { rootMargin?: string }) {
      this.o = { cb, off: false, ...(opts?.rootMargin ? { margin: opts.rootMargin } : {}) };
      observers.push(this.o);
    }
    observe() {}
    disconnect() {
      this.o.off = true;
    }
  };
  delete g.requestIdleCallback;
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(saved)) g[k] = saved[k];
});

describe('afterPaint', () => {
  it('runs after the next frame, in a task of its own, and not once cancelled', () => {
    const fn = vi.fn();
    afterPaint(fn);
    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled(); // no frame yet
    paint();
    expect(fn).not.toHaveBeenCalled(); // not inside the frame
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);
    const no = vi.fn();
    afterPaint(no)();
    paint();
    vi.runAllTimers();
    expect(no).not.toHaveBeenCalled();
  });
});

describe('series', () => {
  it('runs the jobs in order, one task each, and a cancel stops the rest', () => {
    const seen: number[] = [];
    const stop = series([() => seen.push(1), () => seen.push(2), () => seen.push(3)]);
    paint();
    vi.advanceTimersToNextTimer();
    expect(seen).toEqual([1]);
    vi.advanceTimersToNextTimer();
    expect(seen).toEqual([1, 2]);
    stop();
    vi.runAllTimers();
    expect(seen).toEqual([1, 2]);
  });
});

describe('whenIdle', () => {
  it('uses the idle callback with the deadline, else a short timer', () => {
    const fn = vi.fn();
    whenIdle(fn, 2000);
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    const ric = vi.fn((cb: () => void, o: { timeout: number }) => (cb(), o.timeout));
    g.requestIdleCallback = ric;
    const fn2 = vi.fn();
    whenIdle(fn2, 1234);
    expect(ric.mock.calls[0]![1]).toEqual({ timeout: 1234 });
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});

describe('whenNear', () => {
  it('runs once when the part comes near, then stops watching', () => {
    const fn = vi.fn();
    whenNear({} as Element, fn, { margin: '50% 0px' });
    expect(observers[0]!.margin).toBe('50% 0px');
    observers[0]!.cb([{ isIntersecting: false }]);
    expect(fn).not.toHaveBeenCalled();
    observers[0]!.cb([{ isIntersecting: true }]);
    observers[0]!.cb([{ isIntersecting: true }]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(observers[0]!.off).toBe(true);
  });
  it('with idleMs: the idle time comes first, the view does not run it again', () => {
    const fn = vi.fn();
    whenNear({} as Element, fn, { idleMs: 2500 });
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    observers[0]!.cb([{ isIntersecting: true }]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('a cancel before either means it never runs', () => {
    const fn = vi.fn();
    whenNear({} as Element, fn, { idleMs: 2500 })();
    vi.runAllTimers();
    observers[0]!.cb([{ isIntersecting: true }]);
    expect(fn).not.toHaveBeenCalled();
  });
});
