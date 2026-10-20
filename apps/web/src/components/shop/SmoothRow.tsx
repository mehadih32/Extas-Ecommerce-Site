'use client';
// PR 42 — a sliding row on the one engine (src/lib/shop/slider.ts). Every sliding row on the site is this component:
// its children are the cards. The engine's numbers are the setting `slider.engine`, handed down by the page.
import type { SliderEngine } from '@extas/settings';
import { useEffect, useRef, type ReactNode } from 'react';
import { afterPaint, whenNear, type Cancel } from '@/lib/shop/later';
import { bindSmoothRow } from '@/lib/shop/slider';

export function SmoothRow({
  id,
  className,
  engine,
  dir = -1,
  speed,
  children,
}: {
  id: string;
  className?: string;
  engine: SliderEngine;
  dir?: -1 | 1;
  speed?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let undo: (() => void) | undefined;
    let stop2: Cancel | undefined;
    // after the first paint, so the row's real width is known, and only once the row comes within a screen of the view
    // (the TBT budget: a row further down makes its copies when it is needed, not while the page loads)
    // ~~requestAnimationFrame(bind) on every row at once~~
    const stop = whenNear(el, () => {
      stop2 = afterPaint(() => {
        undo = bindSmoothRow(el, engine, { dir, ...(speed ? { speed } : {}) });
      });
    });
    return () => {
      stop();
      stop2?.();
      undo?.();
    };
  }, [engine, dir, speed]);
  return (
    <div ref={ref} id={id} className={className} data-smooth="1">
      {children}
    </div>
  );
}
