// PR 43 — the hero's arrows on the one slider engine: one card per tap, eased, through the loop's copies; the drift
// rests while the glide runs and goes on from where it ends; a hand on the row cancels the glide (it wins).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { SliderState, arrowGlide, cardDistance, easeOut, stepRow } from './slider';

const cfg = registry['slider.engine'].default;

let frames: Array<(t: number) => void> = [];
let now = 0;
const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeEach(() => {
  frames = [];
  now = 0;
  for (const k of ['requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia']) saved[k] = g[k];
  g.requestAnimationFrame = (fn: (t: number) => void) => frames.push(fn);
  g.cancelAnimationFrame = () => undefined;
  g.matchMedia = () => ({ matches: false });
});
afterEach(() => {
  for (const k of Object.keys(saved)) g[k] = saved[k];
});

/** Runs the queued frames up to `ms` later. */
function runFor(ms: number) {
  const end = now + ms;
  while (frames.length && now <= end) {
    now += 16;
    const due = frames;
    frames = [];
    due.forEach((f) => f(now));
  }
}

function fakeRow(opts: { looped: boolean; cardStep?: number; width?: number; scrollWidth?: number }) {
  const step = opts.cardStep ?? 200;
  const kids = [0, 1, 2].map((i) => ({ offsetLeft: i * step, offsetWidth: step - 2, nextElementSibling: null as unknown }));
  kids[0]!.nextElementSibling = kids[1];
  kids[1]!.nextElementSibling = kids[2];
  const el = {
    firstElementChild: kids[0],
    clientWidth: opts.width ?? 400,
    scrollWidth: opts.scrollWidth ?? 2400,
    scrollLeft: 0,
    style: {} as Record<string, string>,
    dataset: (opts.looped ? { sm: '1' } : {}) as Record<string, string>,
  } as unknown as HTMLElement & { __smooth?: SliderState };
  if (opts.looped) {
    const st = new SliderState(cfg, () => now);
    st.half = 1200;
    el.__smooth = st;
  }
  return el;
}

describe('the arrows (PR 43)', () => {
  it('one tap is one card, gap included', () => {
    expect(cardDistance(fakeRow({ looped: false, cardStep: 220 }))).toBe(220);
  });

  it('a looped row goes round through its copies, both ways', () => {
    expect(arrowGlide(1100, 200, 1200, 2000).to).toBe(100);
    expect(arrowGlide(50, -200, 1200, 2000).to).toBe(1050);
    const g1 = arrowGlide(0, 200, 1200, 2000);
    expect(g1.at(0)).toBe(0);
    expect(g1.at(0.5)).toBeCloseTo(200 * easeOut(0.5));
    expect(g1.at(1)).toBe(200);
  });

  it('a row that only scrolls stops at its ends; a tap past an end comes round', () => {
    expect(arrowGlide(100, 200, 0, 250).to).toBe(250);
    expect(arrowGlide(250, 200, 0, 250).to).toBe(0);
    expect(arrowGlide(0, -200, 0, 250).to).toBe(250);
  });

  it('glides over stepMs while the drift rests, then the drift goes on from the new place', () => {
    const el = fakeRow({ looped: true });
    const st = el.__smooth!;
    st.x = 300;
    el.scrollLeft = 300;
    stepRow(el, 1, 380);
    expect(st.snapping).toBe(true);
    expect(st.paused()).toBe(true);
    expect(st.step(16, el.scrollLeft)).toBeNull();
    runFor(200);
    expect(el.scrollLeft).toBeGreaterThan(300);
    expect(el.scrollLeft).toBeLessThan(500);
    runFor(400);
    expect(el.scrollLeft).toBe(500);
    expect(st.x).toBe(500);
    expect(st.snapping).toBe(false);
    expect(st.paused()).toBe(false);
    expect(st.step(50, el.scrollLeft)).toBeCloseTo(500 + cfg.speed * 0.05);
  });

  it('a mouse tap does not start the touch hold; a finger tap does, and it ends by itself', () => {
    const el = fakeRow({ looped: true });
    stepRow(el, 1, 380, 'mouse');
    runFor(600);
    expect(el.__smooth!.paused()).toBe(false);
    stepRow(el, -1, 380, 'touch');
    runFor(600);
    expect(el.__smooth!.paused()).toBe(true);
    now += cfg.touchHoldMs + 1;
    expect(el.__smooth!.paused()).toBe(false);
  });

  it('a hand on the row during the glide wins: the glide stops where it is', () => {
    const el = fakeRow({ looped: true });
    stepRow(el, 1, 380);
    runFor(100);
    const at = el.scrollLeft;
    el.__smooth!.handStart('touchstart', {}, at);
    runFor(600);
    expect(el.scrollLeft).toBe(at);
    expect(el.__smooth!.snapping).toBe(false);
  });

  it('reduced motion: one tap jumps straight to the next card', () => {
    g.matchMedia = () => ({ matches: true });
    const el = fakeRow({ looped: false });
    stepRow(el, 1, 380);
    expect(el.scrollLeft).toBe(200);
    expect(frames).toHaveLength(0);
  });
});
