// PR 67 — the clock of a grid that changes page by itself (the desktop "Recently viewed" grid, demo 89x-owner-b.js
// ownb_rvStart). Hands always win, with the slider engine's own rules and numbers (`slider.engine`, PR 42):
//
//   mouse    `hover` — the mouse on the grid stops it; leaving starts it again at once.
//   touch    `hold`  — a finger stops it for `touchHoldMs`; every later touch restarts the hold.
//   keyboard `focus` — focus inside stops it; it runs again `focusGraceMs` after focus leaves.
//   a hidden browser tab stops it too.
//
// Three separate flags, each cleared only by its own event (checklist L32/L33). Time counts only while none is set, so
// a page always gets its full `everyMs` in front of the eyes. Plain TypeScript with an injected clock, unit-tested; the
// component wires it to the DOM.

export interface SwapRules {
  everyMs: number;
  touchHoldMs: number;
  focusGraceMs: number;
}

export class SwapClock {
  page = 0;
  hover = false;
  focus = false;
  hidden = false;
  /** Touch hold, and the focus grace after focus leaves: no time counts before this moment (ms). */
  restUntil = 0;
  private acc = 0;
  private last: number;

  constructor(
    readonly pages: number,
    readonly rules: SwapRules,
    readonly now: () => number = Date.now,
  ) {
    this.last = now();
  }

  /** Whether the grid changes at all (more than one page, a positive interval). */
  get live(): boolean {
    return this.pages > 1 && this.rules.everyMs > 0;
  }

  paused(): boolean {
    return this.hover || this.focus || this.hidden || this.now() < this.restUntil;
  }

  pointerEnter(kind: string): void {
    if (kind === 'mouse') this.hover = true;
  }

  pointerLeave(kind: string): void {
    if (kind === 'mouse') this.hover = false;
  }

  touch(): void {
    this.restUntil = Math.max(this.restUntil, this.now() + this.rules.touchHoldMs);
  }

  focusIn(): void {
    this.focus = true;
  }

  focusOut(): void {
    this.focus = false;
    this.restUntil = Math.max(this.restUntil, this.now() + this.rules.focusGraceMs);
  }

  /** Moves the clock on; returns true when the page changed. */
  tick(): boolean {
    const t = this.now();
    const dt = Math.max(0, t - this.last);
    this.last = t;
    if (!this.live || this.paused()) return false;
    this.acc += dt;
    if (this.acc < this.rules.everyMs) return false;
    this.acc = 0;
    this.page = (this.page + 1) % this.pages;
    return true;
  }

  /** A dot pressed: that page, and a fresh interval. */
  show(page: number): void {
    this.page = ((page % this.pages) + this.pages) % this.pages;
    this.acc = 0;
  }
}
