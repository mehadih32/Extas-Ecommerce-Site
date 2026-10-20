// PR 42 — the one smooth slider engine every sliding row uses (the demo's SMOOTH, docs/demo/src/02-core.js, and the
// keyboard pause of 97-desk-a.js). A row's cards are cloned once, the position moves a fraction of a pixel per frame
// and wraps after exactly one lap, so the glide never jumps. Hands always win over the drift:
//
//   mouse    `hover`  — the mouse on the row stops it; leaving starts it again AT ONCE (owner 19 Oct 21:09).
//   touch    `pause`  — a finger stops it for `touchHoldMs` (4 s, C2); every later touch restarts the 4 s.
//   keyboard `focus`  — focus inside the row stops it; it moves again `focusGraceMs` after focus leaves, or at once
//                        when the mouse is used. Focus a pointer press caused is not a keyboard pause.
//
// Three separate flags, each with its own resume (TA-2 T1–T4, checklist L32/L33). A mouse never sets the touch hold,
// so a mouse drag or a sideways wheel never leaves a row frozen after the mouse has gone. A vertical wheel is the
// page's, not the row's. Every row drags with the mouse (a click after a drag never opens the card), and after a hand
// drag the row glides to the nearest card — a clear swipe always goes on to the next one. Reduced motion: no drift,
// the drag still works. All numbers are the setting `slider.engine` (PR 42).
//
// The state machine below is plain TypeScript (unit-tested with a fake clock); `bindSmoothRow` wires it to a real row.
import type { SliderEngine } from '@extas/settings';

export type Hand = 'mouse' | 'touch' | 'pen' | '';

export interface RowOptions {
  /** -1 = the cards drift to the left (the default), +1 = to the right. */
  dir?: -1 | 1;
  /** Pixels per second; the setting's speed when left out. */
  speed?: number;
}

export class SliderState {
  /** The true position (the browser rounds scrollLeft, so a slow drift is kept here as a float). */
  x = 0;
  /** One lap: the distance from the first card to its first copy. */
  half = 0;
  /** +1 = scrollLeft grows (cards move left). */
  dir: 1 | -1 = 1;
  speed: number;
  hover = false;
  focus = false;
  /** Touch hold: the row rests until this time (ms). */
  pause = 0;
  ptr: Hand = '';
  /** A hand moved the row and its end has not been settled yet. */
  user = false;
  down = false;
  snapping = false;
  snapToken = 0;
  dragFrom: number | null = null;

  constructor(
    readonly cfg: SliderEngine,
    readonly now: () => number = Date.now,
    opts: RowOptions = {},
  ) {
    this.speed = opts.speed ?? cfg.speed;
    this.dir = opts.dir === 1 ? -1 : 1;
  }

  /** The touch hold — a touch rule only (T1): a mouse never sets it. */
  hold(): void {
    if (this.ptr === 'mouse') return;
    this.pause = this.now() + this.cfg.touchHoldMs;
  }

  paused(): boolean {
    return this.hover || this.focus || this.snapping || this.now() < this.pause;
  }

  pointerEnter(type: string): void {
    if (type === 'mouse') this.hover = true;
  }

  /** The mouse left: the row moves again at once (a drag still settling finishes its snap first). */
  pointerLeave(type: string, scrollLeft: number): void {
    if (type !== 'mouse') return;
    this.hover = false;
    if (!this.down) {
      this.pause = 0;
      this.x = scrollLeft;
    }
  }

  /** Keyboard focus came into the row. `byPointer`: a press caused it — not a keyboard pause. */
  focusIn(byPointer: boolean): void {
    if (!byPointer) this.focus = true;
  }

  /** Focus left the row: the keyboard pause ends after the grace time. */
  focusOut(): void {
    if (!this.focus) return;
    this.focus = false;
    this.pause = Math.max(this.pause, this.now() + this.cfg.focusGraceMs);
  }

  /** The mouse is being used: a keyboard pause ends at once. */
  mouseUsed(): void {
    if (this.focus) this.focus = false;
  }

  /**
   * A hand on the row. Returns false when the event is not the row's (a hover move, a vertical wheel).
   * `kind` is the DOM event name; `scrollLeft` is where the row is now.
   */
  handStart(
    kind: 'pointerdown' | 'pointermove' | 'touchstart' | 'touchmove' | 'wheel',
    ev: { pointerType?: string; buttons?: number; deltaX?: number; deltaY?: number },
    scrollLeft: number,
  ): boolean {
    if (kind === 'pointermove' && ev.buttons === 0) return false;
    if (kind === 'wheel') {
      if (Math.abs(ev.deltaX ?? 0) <= Math.abs(ev.deltaY ?? 0)) return false;
      this.ptr = 'mouse';
    }
    if (kind === 'pointerdown' || kind === 'pointermove') this.ptr = (ev.pointerType as Hand) || 'mouse';
    if (kind === 'touchstart') this.ptr = 'touch';
    this.hold();
    if (!this.user) {
      this.user = true;
      this.dragFrom = scrollLeft;
    }
    this.snapToken++;
    this.snapping = false;
    if (kind === 'touchstart' || kind === 'pointerdown') this.down = true;
    return true;
  }

  /** The finger or button is up. */
  handEnd(): void {
    this.down = false;
    this.hold();
  }

  /** The row scrolled: while it rests, a hand's scroll is the new truth. */
  scrolled(scrollLeft: number): void {
    if (this.hover || this.now() < this.pause) this.x = scrollLeft;
  }

  /** Whether a scroll should re-arm the settle (a fling still moving after the hand left). Mouse drift is not a hand. */
  scrollIsHand(): boolean {
    return this.user && !this.down && !this.snapping && (this.hover || this.ptr !== 'mouse');
  }

  /** One frame of drift: the new position, or null while the row rests. `dt` in ms (capped at 64). */
  step(dt: number, scrollLeft: number): number | null {
    if (this.paused()) {
      if (!this.snapping) this.x = scrollLeft;
      return null;
    }
    const half = this.half;
    if (!(half > 0)) return null;
    this.x += this.speed * (Math.min(64, dt) / 1000) * this.dir;
    if (this.x >= half) this.x -= half;
    if (this.x < 0) this.x += half;
    return this.x;
  }
}

/** Where a row starts: on a card edge — 0, or a whole lap in when the cards drift right (room to move into). */
export function startPosition(state: SliderState): number {
  return state.dir === -1 ? state.half : 0;
}

/** The scroll position of the card edge nearest to `cur`. */
export function nearestEdge(cur: number, edges: readonly number[]): number {
  let best: number | null = null;
  for (const t of edges) if (best === null || Math.abs(t - cur) < Math.abs(best - cur)) best = t;
  return best ?? cur;
}

/** After a drag from `from` to `cur`: the nearest card, but a clear swipe never springs back — it goes to the next card. */
export function snapTarget(cur: number, from: number, edges: readonly number[], swipeNextPx: number): number {
  let to = nearestEdge(cur, edges);
  const dir = cur > from ? 1 : cur < from ? -1 : 0;
  if (dir && Math.abs(cur - from) >= swipeNextPx && (to - from) * dir <= 4) {
    let pick: number | null = null;
    for (const t of edges) if ((t - from) * dir > 4 && (pick === null || Math.abs(t - from) < Math.abs(pick - from))) pick = t;
    if (pick !== null) to = pick;
  }
  return to;
}

/** How long the snap glide takes for a distance (shorter for a nudge, capped for a long way). */
export function snapDuration(distance: number, cfg: Pick<SliderEngine, 'snapMinMs' | 'snapMaxMs'>): number {
  return Math.min(cfg.snapMaxMs, cfg.snapMinMs + Math.abs(distance) * 0.9);
}

export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Keeps a dragged position inside one lap (the clones make the wrap invisible). */
export function wrapPosition(x: number, half: number, max: number): number {
  if (!(half > 0)) return Math.max(0, Math.min(x, max));
  let v = x;
  if (v >= half) v -= half;
  if (v < 0) v += half;
  return v;
}

/** A row drifts only when the setting is on and the person has not asked for less motion. */
export function shouldDrift(cfg: Pick<SliderEngine, 'autoDrift'>, reducedMotion: boolean): boolean {
  return cfg.autoDrift && !reducedMotion;
}

// ---------------------------------------------------------------------------------------------------------------------
// The DOM side: one row element (its children are the cards).

const FOCUSABLE = 'a,button,input,select,textarea,[tabindex]';

/** Wires a row: mouse drag always; with drift, the clones, the three pause flags and the frame loop. Returns cleanup. */
export function bindSmoothRow(el: HTMLElement, cfg: SliderEngine, opts: RowOptions = {}): () => void {
  const off: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (ev: never) => void, o?: AddEventListenerOptions) => {
    t.addEventListener(type, fn as EventListener, o);
    off.push(() => t.removeEventListener(type, fn as EventListener, o));
  };
  const overflow = () => el.scrollWidth > el.clientWidth + 4;
  if (!overflow()) return () => undefined;

  const st = new SliderState(cfg, Date.now, opts);
  el.dataset.drag = '1';

  // ---- the mouse drag (every row, reduced motion too) ----
  let mDown = false;
  let mx0 = 0;
  let mFrom = 0;
  let moved = false;
  on(el, 'dragstart', (ev: DragEvent) => ev.preventDefault());
  on(el, 'pointerdown', (ev: PointerEvent) => {
    if (ev.pointerType === 'touch' || ev.button !== 0) return;
    mDown = true;
    moved = false;
    mx0 = ev.clientX;
    mFrom = el.scrollLeft;
    el.style.scrollSnapType = 'none';
    el.style.scrollBehavior = 'auto';
    el.style.cursor = 'grabbing';
  });
  on(el, 'pointermove', (ev: PointerEvent) => {
    if (!mDown) return;
    const d = ev.clientX - mx0;
    if (Math.abs(d) > cfg.dragStartPx) moved = true;
    el.scrollLeft = wrapPosition(mFrom - d, el.dataset.sm ? st.half : 0, el.scrollWidth - el.clientWidth);
    ev.preventDefault();
  });
  const mUp = () => {
    if (!mDown) return;
    mDown = false;
    el.style.cursor = '';
    if (!el.dataset.sm) {
      el.style.scrollBehavior = '';
      el.style.scrollSnapType = '';
    }
  };
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) on(el, t, mUp);
  on(
    el,
    'click',
    (ev: MouseEvent) => {
      if (moved) {
        ev.preventDefault();
        ev.stopPropagation();
        moved = false;
      }
    },
    { capture: true },
  );

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!shouldDrift(cfg, reduced)) return () => off.forEach((f) => f());

  // ---- the clones: one lap of copies, hidden from screen readers and the keyboard ----
  const kids = Array.from(el.children) as HTMLElement[];
  const clones: HTMLElement[] = [];
  for (const k of kids) {
    const c = k.cloneNode(true) as HTMLElement;
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('tabindex', '-1');
    c.querySelectorAll(FOCUSABLE).forEach((n) => n.setAttribute('tabindex', '-1'));
    c.dataset.clone = '1';
    el.appendChild(c);
    clones.push(c);
  }
  el.dataset.sm = '1';
  el.style.scrollSnapType = 'none';
  el.style.scrollBehavior = 'auto';
  const lap = () => {
    const a = kids[0];
    const b = clones[0];
    return a && b ? b.getBoundingClientRect().left - a.getBoundingClientRect().left : 0;
  };
  st.half = lap() || el.scrollWidth / 2;
  const edges = (): number[] => {
    const cs = getComputedStyle(el);
    const edge = el.getBoundingClientRect().left + (Number.parseFloat(cs.paddingLeft) || 0) + (Number.parseFloat(cs.borderLeftWidth) || 0);
    const cur = el.scrollLeft;
    return Array.from(el.children).map((k) => cur + k.getBoundingClientRect().left - edge);
  };
  st.x = startPosition(st);
  el.scrollLeft = st.x;

  // ---- snap after a hand drag ----
  let settleT: ReturnType<typeof setTimeout> | undefined;
  const snap = () => {
    st.user = false;
    const from = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;
    const to = Math.max(0, Math.min(max, snapTarget(from, st.dragFrom ?? from, edges(), cfg.swipeNextPx)));
    if (Math.abs(to - from) < 1) {
      st.x = from;
      return;
    }
    const dur = snapDuration(to - from, cfg);
    const tok = ++st.snapToken;
    let t0 = 0;
    st.snapping = true;
    const frame = (now: number) => {
      if (st.snapToken !== tok) return;
      if (!t0) t0 = now;
      const k = dur > 0 ? Math.min(1, (now - t0) / dur) : 1;
      const v = from + (to - from) * easeOut(k);
      el.scrollLeft = v;
      st.x = v;
      if (k < 1) requestAnimationFrame(frame);
      else {
        st.snapping = false;
        if (st.half > 0 && to >= st.half) {
          el.scrollLeft = to - st.half;
          st.x = to - st.half;
        } else st.x = to;
        st.hold();
      }
    };
    requestAnimationFrame(frame);
  };
  const settleLater = (ms = cfg.settleMs) => {
    clearTimeout(settleT);
    settleT = setTimeout(() => {
      if (st.down || !st.user) return;
      if (Math.abs(el.scrollLeft - (st.dragFrom ?? el.scrollLeft)) < 3) {
        st.user = false;
        return;
      }
      snap();
    }, ms);
  };

  // ---- the hands ----
  for (const kind of ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel'] as const) {
    on(
      el,
      kind,
      (ev: PointerEvent & WheelEvent) => {
        if (!st.handStart(kind, ev, el.scrollLeft)) return;
        if (kind === 'wheel') settleLater(cfg.wheelSettleMs);
      },
      { passive: true },
    );
  }
  for (const kind of ['touchend', 'touchcancel', 'pointerup', 'pointercancel']) {
    on(
      el,
      kind,
      () => {
        st.handEnd();
        if (st.user) settleLater();
      },
      { passive: true },
    );
  }
  // A mouse drag can end off the row.
  on(
    window,
    'pointerup',
    () => {
      if (st.down) {
        st.down = false;
        if (st.user) settleLater();
      }
    },
    { passive: true },
  );
  on(el, 'scrollend', () => {
    if (st.user && !st.down) settleLater(0);
  });
  on(el, 'pointerenter', (ev: PointerEvent) => st.pointerEnter(ev.pointerType));
  on(el, 'pointerleave', (ev: PointerEvent) => st.pointerLeave(ev.pointerType, el.scrollLeft));
  on(
    el,
    'scroll',
    () => {
      st.scrolled(el.scrollLeft);
      if (st.scrollIsHand()) {
        st.hold();
        settleLater();
      }
    },
    { passive: true },
  );

  // ---- the keyboard ----
  let pressed = false;
  on(
    el,
    'pointerdown',
    () => {
      pressed = true;
      setTimeout(() => (pressed = false), 0);
      st.focus = false;
    },
    { capture: true },
  );
  on(el, 'pointermove', (ev: PointerEvent) => {
    if (ev.pointerType === 'mouse') st.mouseUsed();
  });
  on(el, 'focusin', (ev: FocusEvent) => {
    st.focusIn(pressed);
    let card = ev.target as HTMLElement | null;
    while (card && card.parentElement !== el) card = card.parentElement;
    if (card && !pressed) card.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  on(el, 'focusout', (ev: FocusEvent) => {
    if (el.contains(ev.relatedTarget as Node | null)) return;
    st.focusOut();
  });

  // ---- a new width keeps the same card in view ----
  let resizeT: ReturnType<typeof setTimeout> | undefined;
  on(window, 'resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const oldHalf = st.half;
      const l = lap();
      if (!(l > 0)) return;
      st.snapToken++;
      st.snapping = false;
      let x = oldHalf > 0 ? (st.x / oldHalf) * l : st.x;
      st.half = l;
      if (x >= l) x -= l;
      el.scrollLeft = x;
      st.x = x;
      if (Date.now() < st.pause && !st.hover) {
        let to = nearestEdge(el.scrollLeft, edges());
        if (to >= l) to -= l;
        el.scrollLeft = Math.max(0, to);
        st.x = el.scrollLeft;
      }
    }, 120);
  });

  // ---- the drift ----
  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = last ? now - last : 16;
    last = now;
    const x = st.step(dt, el.scrollLeft);
    if (x !== null) el.scrollLeft = Math.round(x);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  (el as HTMLElement & { __smooth?: SliderState }).__smooth = st;

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(settleT);
    clearTimeout(resizeT);
    off.forEach((f) => f());
    clones.forEach((c) => c.remove());
    delete el.dataset.sm;
    delete el.dataset.drag;
    el.style.scrollSnapType = '';
    el.style.scrollBehavior = '';
  };
}
