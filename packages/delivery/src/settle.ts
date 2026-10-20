// PR 551 — when the address line is "finished": nothing is decided while the customer is still typing. The line is read
// when he leaves the field (blur), or after a pause long enough (`delivery.resolver.settleMs`) once it has at least
// `delivery.resolver.minWords` words. Typing again cancels a waiting read and starts the wait over — the pause always
// resumes: after a read, more typing leads to a new read after the next pause. The same line is never read twice in a
// row. No DOM, no clock of its own: the screen passes its events in, tests pass fake timers.
import { words } from './text';

export interface SettleTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SettleOptions {
  settleMs: number;
  minWords: number;
  /** Called with the finished line. */
  onSettle: (line: string, why: 'pause' | 'blur') => void;
  timers?: SettleTimers;
}

export interface SettleController {
  /** The field's text changed (typing, paste, autofill). */
  input(line: string): void;
  /** The customer left the field: read it now. */
  blur(): void;
  /** The line last read (null before the first read). */
  readonly settled: string | null;
  /** True while a pause is being waited out. */
  readonly waiting: boolean;
  /** Forget the last read (a new checkout, or the customer cleared the band he chose). */
  reset(): void;
  dispose(): void;
}

const realTimers: SettleTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

export function createSettle(opts: SettleOptions): SettleController {
  const timers = opts.timers ?? realTimers;
  let text = '';
  let settled: string | null = null;
  let handle: unknown = null;
  let disposed = false;

  const cancel = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const fire = (why: 'pause' | 'blur') => {
    cancel();
    const line = text.trim();
    if (disposed || !line || line === settled) return;
    settled = line;
    opts.onSettle(line, why);
  };

  return {
    input(line) {
      if (disposed) return;
      text = line;
      cancel();
      if (words(line).length >= opts.minWords) handle = timers.setTimeout(() => fire('pause'), opts.settleMs);
    },
    blur() {
      fire('blur');
    },
    get settled() {
      return settled;
    },
    get waiting() {
      return handle !== null;
    },
    reset() {
      settled = null;
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
