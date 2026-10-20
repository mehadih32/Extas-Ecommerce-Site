// PR 42 — the slider's three pause flags, each with its own resume (TA-2 T1–T4, checklist L32/L33), on a fake clock.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { SliderState, easeOut, nearestEdge, shouldDrift, snapDuration, snapTarget, startPosition, wrapPosition } from './slider';

const cfg = registry['slider.engine'].default;

function row(opts: { dir?: -1 | 1 } = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const st = new SliderState(cfg, clock.now, opts);
  st.half = 1000;
  return { st, clock };
}

describe('slider engine — mouse (hover)', () => {
  it('stops under the mouse and moves again at once when it leaves', () => {
    const { st } = row();
    st.pointerEnter('mouse');
    expect(st.paused()).toBe(true);
    expect(st.step(16, 0)).toBeNull();
    st.pointerLeave('mouse', 120);
    expect(st.paused()).toBe(false);
    expect(st.x).toBe(120);
    expect(st.step(16, 120)).toBeGreaterThan(120);
  });

  it('a touch never sets the hover flag (a phone tap fires no matching leave)', () => {
    const { st } = row();
    st.pointerEnter('touch');
    expect(st.hover).toBe(false);
  });

  it('a mouse drag never leaves the 4-second hold behind', () => {
    const { st } = row();
    st.pointerEnter('mouse');
    st.handStart('pointerdown', { pointerType: 'mouse', buttons: 1 }, 0);
    st.handStart('pointermove', { pointerType: 'mouse', buttons: 1 }, 40);
    st.handEnd();
    expect(st.pause).toBe(0);
    st.pointerLeave('mouse', 40);
    expect(st.paused()).toBe(false);
  });

  it('a sideways wheel moves the row as a mouse would; resumes as soon as the mouse is gone', () => {
    const { st } = row();
    st.pointerEnter('mouse');
    expect(st.handStart('wheel', { deltaX: 30, deltaY: 2 }, 0)).toBe(true);
    expect(st.ptr).toBe('mouse');
    expect(st.pause).toBe(0);
    st.pointerLeave('mouse', 30);
    expect(st.paused()).toBe(false);
  });

  it('a vertical wheel is the page scrolling: ignored', () => {
    const { st } = row();
    expect(st.handStart('wheel', { deltaX: 0, deltaY: 40 }, 0)).toBe(false);
    expect(st.user).toBe(false);
    expect(st.paused()).toBe(false);
  });

  it('a hover move without a button is not a drag', () => {
    const { st } = row();
    expect(st.handStart('pointermove', { pointerType: 'mouse', buttons: 0 }, 0)).toBe(false);
  });
});

describe('slider engine — touch (hold)', () => {
  it('a finger stops the row for the hold time, then it moves by itself', () => {
    const { st, clock } = row();
    st.handStart('touchstart', {}, 0);
    st.handEnd();
    expect(st.paused()).toBe(true);
    clock.advance(cfg.touchHoldMs - 1);
    expect(st.paused()).toBe(true);
    clock.advance(2);
    expect(st.paused()).toBe(false);
    expect(st.step(16, 0)).not.toBeNull();
  });

  it('every later touch restarts the hold', () => {
    const { st, clock } = row();
    st.handStart('touchstart', {}, 0);
    st.handEnd();
    clock.advance(3000);
    st.handStart('touchstart', {}, 0);
    st.handEnd();
    clock.advance(3000);
    expect(st.paused()).toBe(true);
    clock.advance(cfg.touchHoldMs);
    expect(st.paused()).toBe(false);
  });
});

describe('slider engine — keyboard (focus)', () => {
  it('focus stops the row; it moves again after the grace time once focus leaves', () => {
    const { st, clock } = row();
    st.focusIn(false);
    expect(st.paused()).toBe(true);
    clock.advance(60_000);
    expect(st.paused()).toBe(true);
    st.focusOut();
    expect(st.paused()).toBe(true);
    clock.advance(cfg.focusGraceMs + 1);
    expect(st.paused()).toBe(false);
  });

  it('the mouse being used ends a keyboard pause at once', () => {
    const { st } = row();
    st.focusIn(false);
    st.mouseUsed();
    expect(st.paused()).toBe(false);
  });

  it('focus caused by a pointer press is not a keyboard pause', () => {
    const { st } = row();
    st.focusIn(true);
    expect(st.focus).toBe(false);
    expect(st.paused()).toBe(false);
  });

  it('the three flags are separate: the mouse leaving does not end a keyboard pause', () => {
    const { st } = row();
    st.focusIn(false);
    st.pointerEnter('mouse');
    st.pointerLeave('mouse', 0);
    expect(st.paused()).toBe(true);
  });
});

describe('slider engine — drift, wrap, snap', () => {
  it('drifts at the set speed and wraps after exactly one lap', () => {
    const { st } = row();
    st.x = 999;
    const x = st.step(1000 / 22, 999);
    expect(x).not.toBeNull();
    expect(x!).toBeCloseTo(0, 0);
  });

  it('a row drifting right starts one lap in and moves backwards', () => {
    const { st } = row({ dir: 1 });
    expect(st.dir).toBe(-1);
    expect(startPosition(st)).toBe(1000);
    st.x = 10;
    expect(st.step(50, 10)).toBeCloseTo(10 - cfg.speed * 0.05, 5);
    // Past the start edge it wraps to the same picture one lap on.
    st.x = 0.5;
    expect(st.step(50, 0.5)).toBeCloseTo(0.5 - cfg.speed * 0.05 + 1000, 5);
  });

  it('a frame gap is capped, so a background tab never jumps the row', () => {
    const { st } = row();
    expect(st.step(5000, 0)).toBeCloseTo((cfg.speed * 64) / 1000, 5);
  });

  it('after a drag the row goes to the nearest card; a clear swipe goes on to the next card', () => {
    const edges = [0, 200, 400, 600];
    expect(nearestEdge(90, edges)).toBe(0);
    expect(snapTarget(30, 0, edges, cfg.swipeNextPx)).toBe(0);
    expect(snapTarget(60, 0, edges, cfg.swipeNextPx)).toBe(200);
    expect(snapTarget(340, 400, edges, cfg.swipeNextPx)).toBe(200);
    expect(snapTarget(370, 400, edges, cfg.swipeNextPx)).toBe(400);
  });

  it('the snap glide is short for a nudge and capped for a long way', () => {
    expect(snapDuration(0, cfg)).toBe(cfg.snapMinMs);
    expect(snapDuration(5000, cfg)).toBe(cfg.snapMaxMs);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  it('a dragged position stays inside one lap', () => {
    expect(wrapPosition(1010, 1000, 2000)).toBe(10);
    expect(wrapPosition(-10, 1000, 2000)).toBe(990);
    expect(wrapPosition(-10, 0, 2000)).toBe(0);
  });

  it('reduced motion: no drift (the drag stays)', () => {
    expect(shouldDrift(cfg, true)).toBe(false);
    expect(shouldDrift(cfg, false)).toBe(true);
    expect(shouldDrift({ autoDrift: false }, false)).toBe(false);
  });
});
