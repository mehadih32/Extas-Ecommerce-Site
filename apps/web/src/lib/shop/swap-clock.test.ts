// PR 67 — the desktop "Recently viewed" grid's clock: three pause flags (mouse, touch, keyboard), each with its own
// tested resume (checklist L32/L33), plus a hidden tab.
import { describe, expect, it } from 'vitest';
import { SwapClock } from './swap-clock';

function clock(pages = 3, everyMs = 1000) {
  let t = 0;
  const c = new SwapClock(pages, { everyMs, touchHoldMs: 4000, focusGraceMs: 1500 }, () => t);
  const run = (ms: number) => {
    for (let i = 0; i < ms / 100; i++) {
      t += 100;
      c.tick();
    }
  };
  return { c, run };
}

describe('SwapClock', () => {
  it('turns the page after the interval and wraps', () => {
    const { c, run } = clock();
    run(1000);
    expect(c.page).toBe(1);
    run(2000);
    expect(c.page).toBe(0);
  });

  it('one page or a zero interval never changes', () => {
    expect(clock(1).c.live).toBe(false);
    expect(clock(3, 0).c.live).toBe(false);
    const { c, run } = clock(1);
    run(5000);
    expect(c.page).toBe(0);
  });

  it('mouse: stops while on the grid, runs again at once when it leaves; a touch pointer never sets it', () => {
    const { c, run } = clock();
    c.pointerEnter('mouse');
    run(5000);
    expect(c.page).toBe(0);
    c.pointerLeave('mouse');
    run(1000);
    expect(c.page).toBe(1);
    c.pointerEnter('touch');
    expect(c.hover).toBe(false);
  });

  it('touch: rests for the hold, every later touch restarts it', () => {
    const { c, run } = clock();
    c.touch();
    run(3000);
    c.touch();
    run(3900);
    expect(c.page).toBe(0);
    run(1200);
    expect(c.page).toBe(1);
  });

  it('keyboard: stops while focus is inside, runs again after the grace once it leaves', () => {
    const { c, run } = clock();
    c.focusIn();
    run(5000);
    expect(c.page).toBe(0);
    c.focusOut();
    run(1400);
    expect(c.page).toBe(0);
    run(1200);
    expect(c.page).toBe(1);
  });

  it('a hidden tab stops it; the flags are separate (leaving with the mouse does not end a keyboard pause)', () => {
    const { c, run } = clock();
    c.hidden = true;
    run(3000);
    expect(c.page).toBe(0);
    c.hidden = false;
    c.focusIn();
    c.pointerEnter('mouse');
    c.pointerLeave('mouse');
    run(3000);
    expect(c.page).toBe(0);
    c.focusOut();
    run(2600);
    expect(c.page).toBe(1);
  });

  it('a page always gets its full time in view: time paused does not count', () => {
    const { c, run } = clock();
    run(800);
    c.pointerEnter('mouse');
    run(2000);
    c.pointerLeave('mouse');
    run(100);
    expect(c.page).toBe(0);
    run(100);
    expect(c.page).toBe(1);
  });
});
