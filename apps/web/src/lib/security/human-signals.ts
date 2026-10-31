// S18 · PR 379 (Blueprint B6.3) — the page's side of the quiet bot check. Nothing is shown and nothing is asked: the
// page counts the key presses, taps and mouse clicks it sees from the moment a form appeared; the sign-in and the
// order send that with their request (`human`). No key that was typed, no position, nothing personal — only a count,
// the time since the form appeared and the browser's own automation flag.

/** What a form sends. `ms`: time since the form appeared; `inputs`: keys, taps and clicks seen; `auto`: automation. */
export interface HumanSignals {
  ms: number;
  inputs: number;
  auto: boolean;
}

const G = globalThis as unknown as { __extasHuman?: { inputs: number; since: number } };

/** Starts counting once per page (safe to call from every form's effect; does nothing on the server). */
export function watchHumanInput(now: number = Date.now()): void {
  if (typeof window === 'undefined' || G.__extasHuman) return;
  const state = { inputs: 0, since: now };
  G.__extasHuman = state;
  const count = () => {
    state.inputs += 1;
  };
  for (const type of ['keydown', 'pointerdown', 'touchstart'] as const) window.addEventListener(type, count, { capture: true, passive: true });
}

/** The signals to send now. */
export function humanSignals(now: number = Date.now()): HumanSignals {
  const auto = typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver === true;
  const s = G.__extasHuman;
  return { ms: s ? Math.max(0, Math.round(now - s.since)) : 0, inputs: Math.min(s?.inputs ?? 0, 10_000), auto };
}
