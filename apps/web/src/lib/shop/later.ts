// PR 42 — work that can wait until the page is drawn (the Lighthouse budget: Total Blocking Time ≤ 200 ms, rule 9). The
// sliding rows and the shell's fits (PR 40) measure the page; done all at once while the page hydrates they made one long task.
// Here each job runs in a task of its own after the first paint, so the main thread is free between them (a tap in the
// meantime is answered), and work for a part of the page that is out of sight waits until that part comes near or the
// page is idle, whichever is first. Browser only; every helper returns its cancel.

export type Cancel = () => void;

/** One task after the next frame is painted (layout is clean then, so a measure costs no extra layout). */
export function afterPaint(fn: () => void): Cancel {
  let t: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => {
          t = setTimeout(() => {
            done = true;
            fn();
          }, 0);
        })
      : 0;
  if (!raf) t = setTimeout(fn, 0);
  return () => {
    if (done) return;
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(t);
  };
}

/** The jobs in order after the next paint, each in a task of its own. */
export function series(jobs: ReadonlyArray<() => void>): Cancel {
  let t: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let i = 0;
  const next = () => {
    if (stopped || i >= jobs.length) return;
    const job = jobs[i++]!;
    job();
    if (i < jobs.length) t = setTimeout(next, 0);
  };
  const first = afterPaint(next);
  return () => {
    stopped = true;
    first();
    clearTimeout(t);
  };
}

/** When the browser is idle (at the latest after `timeoutMs`); a timer where idle callbacks are missing (Safari). */
export function whenIdle(fn: () => void, timeoutMs = 2000): Cancel {
  const w = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: timeoutMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = setTimeout(fn, Math.min(timeoutMs, 300));
  return () => clearTimeout(t);
}

/**
 * Once, when `el` comes within `margin` of the screen (an IntersectionObserver rootMargin) — or, with `idleMs`, when the
 * page is idle, whichever is first. Without IntersectionObserver it runs after the next paint.
 */
export function whenNear(el: Element, fn: () => void, opts: { margin?: string; idleMs?: number } = {}): Cancel {
  let done = false;
  const stops: Cancel[] = [];
  const go = () => {
    if (done) return;
    done = true;
    stops.forEach((s) => s());
    fn();
  };
  if (typeof IntersectionObserver !== 'function') return afterPaint(go);
  const io = new IntersectionObserver(
    (es) => {
      if (es.some((e) => e.isIntersecting)) go();
    },
    { rootMargin: opts.margin ?? '100% 0px' },
  );
  io.observe(el);
  stops.push(() => io.disconnect());
  if (opts.idleMs != null) stops.push(whenIdle(go, opts.idleMs));
  return () => {
    done = true;
    stops.forEach((s) => s());
  };
}
