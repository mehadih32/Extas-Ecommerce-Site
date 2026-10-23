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
