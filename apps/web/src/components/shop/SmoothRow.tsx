'use client';
// PR 42 — a sliding row on the one engine (src/lib/shop/slider.ts). Every sliding row on the site is this component:
// its children are the cards. The engine's numbers are the setting `slider.engine`, handed down by the page.
// PR 67: `fitCards` — a row of product cards fits the cards' tight spots (CARD_FIT, the badge and the swatch line)
// after the first paint, before the copies are made, so the copies carry the fitted type too.
import type { SliderEngine } from '@extas/settings';
import { useEffect, useRef, type ReactNode } from 'react';
import { CARD_FIT, fitAll } from '@/lib/shop/fit';
import { afterPaint, whenNear, type Cancel } from '@/lib/shop/later';
import { bindSmoothRow } from '@/lib/shop/slider';

export function SmoothRow({
  id,
  className,
  engine,
  dir = -1,
  speed,
  fitCards = false,
  children,
}: {
  id: string;
  className?: string;
  engine: SliderEngine;
  dir?: -1 | 1;
  speed?: number;
  fitCards?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // the fit runs after the first paint whether or not the row is near, so no card is ever drawn cut (its copies are
    // made later, from the fitted cards)
    const el = ref.current;
    if (!el || !fitCards) return;
    return afterPaint(() => fitAll(el, CARD_FIT));
  }, [fitCards]);
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
