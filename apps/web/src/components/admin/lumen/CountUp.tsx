'use client';
// PR 627 (CN-036, LUMEN-SPEC §1 motion) — a big number that counts up (700 ms, --lm-t-count) when it first shows. The
// server writes the final figure (so the page reads right with no script, and a screen reader gets it at once); the
// count runs only when motion is not reduced (the person's or the team's "Reduce motion", or the system's), and only
// once per value.
import { useEffect, useRef, useState } from 'react';
import { countAt, formatCount, type CountFormat } from '@/lib/admin-lumen/model';
import { motionReduced } from '@/lib/admin-look/theme';

/** The count-up's length in ms (the theme layer's --lm-t-count; 0 when motion is reduced). */
function countMs(el: Element | null): number {
  if (!el || motionReduced()) return 0;
  const raw = getComputedStyle(el).getPropertyValue('--lm-t-count').trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return raw.endsWith('ms') ? n : n * 1000;
}

export function CountUp({ value, shown, format, className, testId }: { value: number; shown: string; format: CountFormat; className?: string; testId?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(shown);

  useEffect(() => {
    const total = countMs(el.current);
    if (!total || !Number.isFinite(value) || value === 0) {
      setText(shown);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const e = now - start;
      if (e >= total) {
        setText(shown);
        return;
      }
      setText(formatCount(countAt(value, e, total), format));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The format object is rebuilt on each render by the page; the value and its final text decide a new run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, shown]);

  return (
    <span ref={el} className={className} data-testid={testId}>
      <span className="lm-vh">{shown}</span>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
