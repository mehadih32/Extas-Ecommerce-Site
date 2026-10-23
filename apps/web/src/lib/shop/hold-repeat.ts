// PR 58 — press and hold a + / − stepper (demo 30-product.js pdp-step "press and hold repeats"): a press that is held
// past `holdMs` steps once and then every `repeatMs`, until the finger or the mouse button lets go, the pointer leaves,
// the press is cancelled, or the value cannot move further. The click that follows a held press is swallowed (the hold
// already stepped); a short press, a tap and the keyboard (Enter / Space only fire the click) step exactly once. The
// demo stepped nothing on a press released between its hold and its first repeat; here the hold itself steps. Pure:
// the timers are passed in, so the tests drive the clock.

export interface HoldRepeat {
  /** Pointer down on the button. */
  press(): void;
  /** Pointer up, leave or cancel: the repeating stops at once. */
  release(): void;
  /** The button's click: steps once, unless a held press already stepped. */
  click(): void;
  /** The button is going away. */
  cancel(): void;
  /** A held press is repeating now. */
  repeating(): boolean;
}

export interface HoldRepeatOptions {
  holdMs: number;
  repeatMs: number;
  /** One step; false when the value could not move (the repeat then stops by itself). */
  step: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export function holdRepeat(o: HoldRepeatOptions): HoldRepeat {
  const set = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clear = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let held = false;
  let on = false;
  const stop = () => {
    if (timer !== null) clear(timer);
    timer = null;
    on = false;
  };
  const tick = () => {
    timer = null;
    if (!on) return;
    if (!o.step()) return stop();
    timer = set(tick, o.repeatMs);
  };
  return {
    press() {
      stop();
      held = false;
      on = true;
      timer = set(() => {
        timer = null;
        if (!on) return;
        held = true;
        tick();
      }, o.holdMs);
    },
    release: stop,
    click() {
      if (held) {
        held = false;
        return;
      }
      o.step();
    },
    cancel() {
      stop();
      held = false;
    },
    repeating: () => on && held,
  };
}
