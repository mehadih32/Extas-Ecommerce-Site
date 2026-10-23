// PR 107 — the clock behind a message that goes away by itself but holds while someone is using it (demo 02-core.js
// toastArm, checklist L33.22/L33.23): the bag's "Removed · Undo" message. A mouse resting on it holds it; keyboard
// focus on its button holds it; a finger does not (a tap is an answer, not a rest). Each has its own flag, so the
// clock starts again only when every hold has ended, and then with at least `minLeftMs` left to read and reach it.
export type HoldKind = 'mouse' | 'key';

export interface HoldTimer {
  hold(kind: HoldKind): void;
  release(kind: HoldKind): void;
  /** Stops for good (the message was answered or replaced). */
  cancel(): void;
  /** Milliseconds left on the clock (while held: what was left when the hold began). */
  left(): number;
  held(): boolean;
}

export interface HoldTimerOptions {
  ms: number;
  minLeftMs?: number;
  onDone: () => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export function holdTimer(o: HoldTimerOptions): HoldTimer {
  const now = o.now ?? (() => Date.now());
  const set = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clear = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const minLeft = o.minLeftMs ?? 1_500;
  const holds = new Set<HoldKind>();
  let timer: unknown = null;
  let endsAt = 0;
  let leftWhenHeld = 0;
  let done = false;
  const arm = (ms: number) => {
    endsAt = now() + ms;
    timer = set(() => {
      timer = null;
      if (done) return;
      done = true;
      o.onDone();
    }, ms);
  };
  arm(o.ms);
  return {
    hold(kind) {
      if (done) return;
      if (!holds.size && timer !== null) {
        clear(timer);
        timer = null;
        leftWhenHeld = Math.max(0, endsAt - now());
      }
      holds.add(kind);
    },
    release(kind) {
      if (done || !holds.delete(kind) || holds.size) return;
      arm(Math.max(minLeft, leftWhenHeld));
    },
    cancel() {
      done = true;
      holds.clear();
      if (timer !== null) clear(timer);
      timer = null;
    },
    left: () => (done ? 0 : holds.size ? leftWhenHeld : Math.max(0, endsAt - now())),
    held: () => holds.size > 0,
  };
}

/** What `holdOn` listens on: an element, or a stand-in in a test. */
export interface HoldTarget {
  addEventListener(type: string, fn: (ev: Event) => void): void;
  contains(node: unknown): boolean;
}

/**
 * PR 91 · wires a message's own holds (checklist L33.23): a mouse resting on it (never a finger) and keyboard focus
 * inside it each hold the clock with their own flag; leaving it (the mouse out of the whole message, the focus out of
 * it) releases that flag, and the clock runs again once both are released.
 */
export function holdOn(el: HoldTarget, timer: HoldTimer): void {
  const touch = (ev: Event) => (ev as Event & { pointerType?: string }).pointerType === 'touch';
  const away = (ev: Event) => !el.contains((ev as Event & { relatedTarget?: unknown }).relatedTarget ?? null);
  el.addEventListener('pointerover', (ev) => void (!touch(ev) && timer.hold('mouse')));
  el.addEventListener('pointerout', (ev) => void (!touch(ev) && away(ev) && timer.release('mouse')));
  el.addEventListener('focusin', (ev) => {
    const t = ev.target as { matches?: (s: string) => boolean } | null;
    if (!t?.matches || t.matches(':focus-visible')) timer.hold('key');
  });
  el.addEventListener('focusout', (ev) => void (away(ev) && timer.release('key')));
}
