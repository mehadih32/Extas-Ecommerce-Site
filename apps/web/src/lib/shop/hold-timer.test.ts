// PR 107 — every pause has a tested resume (CLAUDE.md hard rule 7, checklist L33.22/L33.23): the Undo message's clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdOn, holdTimer } from './hold-timer';

describe('PR 107 · the Undo message holds while it is being used, and goes on by itself after', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes away after its time when nobody touches it', () => {
    const done = vi.fn();
    holdTimer({ ms: 6000, onDone: done });
    vi.advanceTimersByTime(5999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
  });

  it('a resting mouse holds it as long as it rests; leaving resumes with what was left', () => {
    const done = vi.fn();
    const t = holdTimer({ ms: 6000, onDone: done });
    vi.advanceTimersByTime(2000);
    t.hold('mouse');
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
    expect(t.left()).toBe(4000);
    t.release('mouse');
    vi.advanceTimersByTime(3999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
  });

  it('resumes with at least 1.5 s left, so the button can still be reached', () => {
    const done = vi.fn();
    const t = holdTimer({ ms: 6000, onDone: done });
    vi.advanceTimersByTime(5900);
    t.hold('key');
    t.release('key');
    vi.advanceTimersByTime(1499);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
  });

  it('mouse and keyboard each have their own flag: it resumes only when both have let go', () => {
    const done = vi.fn();
    const t = holdTimer({ ms: 6000, onDone: done });
    t.hold('mouse');
    t.hold('key');
    t.release('mouse');
    expect(t.held()).toBe(true);
    vi.advanceTimersByTime(30_000);
    expect(done).not.toHaveBeenCalled();
    t.release('key');
    expect(t.held()).toBe(false);
    vi.advanceTimersByTime(6000);
    expect(done).toHaveBeenCalledOnce();
  });

  it('a release without a hold changes nothing; 20 quick passes end with the clock running', () => {
    const done = vi.fn();
    const t = holdTimer({ ms: 6000, onDone: done });
    t.release('mouse');
    for (let i = 0; i < 20; i++) {
      t.hold('mouse');
      vi.advanceTimersByTime(10);
      t.release('mouse');
    }
    expect(t.held()).toBe(false);
    vi.advanceTimersByTime(6000);
    expect(done).toHaveBeenCalledOnce();
  });

  it('cancel stops it for good (answered or replaced)', () => {
    const done = vi.fn();
    const t = holdTimer({ ms: 6000, onDone: done });
    t.cancel();
    t.hold('mouse');
    t.release('mouse');
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
    expect(t.left()).toBe(0);
  });
});

describe('PR 91 · the "added to your bag · View bag" message: mouse, touch and keyboard each have their own hold', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const inside = { id: 'link' };
  const message = () => {
    const target = new EventTarget();
    const el = Object.assign(target, { contains: (n: unknown) => n === inside || n === el });
    const fire = (type: string, extra: Record<string, unknown>) => el.dispatchEvent(Object.assign(new Event(type), extra));
    return { el, fire };
  };

  it('a resting mouse holds it; moving inside it keeps the hold; leaving it resumes', () => {
    const done = vi.fn();
    const { el, fire } = message();
    const t = holdTimer({ ms: 4500, onDone: done });
    holdOn(el, t);
    fire('pointerover', { pointerType: 'mouse' });
    vi.advanceTimersByTime(30_000);
    fire('pointerout', { pointerType: 'mouse', relatedTarget: inside });
    vi.advanceTimersByTime(30_000);
    expect(done).not.toHaveBeenCalled();
    fire('pointerout', { pointerType: 'mouse', relatedTarget: null });
    vi.advanceTimersByTime(4500);
    expect(done).toHaveBeenCalledOnce();
  });

  it('a finger never holds it (a tap is an answer, not a rest)', () => {
    const done = vi.fn();
    const { el, fire } = message();
    const t = holdTimer({ ms: 4500, onDone: done });
    holdOn(el, t);
    fire('pointerover', { pointerType: 'touch' });
    vi.advanceTimersByTime(4500);
    expect(done).toHaveBeenCalledOnce();
  });

  it('keyboard focus holds it on its own flag; the clock runs again only when mouse and keyboard have both let go', () => {
    const done = vi.fn();
    const { el, fire } = message();
    const t = holdTimer({ ms: 4500, onDone: done });
    holdOn(el, t);
    fire('focusin', {});
    fire('pointerover', { pointerType: 'mouse' });
    fire('pointerout', { pointerType: 'mouse', relatedTarget: null });
    vi.advanceTimersByTime(30_000);
    expect(t.held()).toBe(true);
    fire('focusout', { relatedTarget: null });
    expect(t.held()).toBe(false);
    vi.advanceTimersByTime(4500);
    expect(done).toHaveBeenCalledOnce();
  });
});
