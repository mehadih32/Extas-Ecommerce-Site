'use client';
// PR 67 — the desktop "Recently viewed" grid (owner review P5, demo 89x-owner-b.js ownb_recentDesk / ownb_rvStart): a
// fixed grid of 4 that is never empty and turns to its next page every few seconds. The mouse on it, a finger on it
// and the keyboard inside it each pause it with their own flag and their own resume (lib/shop/swap-clock.ts, the
// slider engine's numbers); a hidden tab pauses it too. The dots only show where it is.
import type { SliderEngine } from '@extas/settings';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { CARD_FIT, fitAll } from '@/lib/shop/fit';
import { SwapClock } from '@/lib/shop/swap-clock';

const TICK_MS = 250;

export function RecentGrid({ title, cols, everyMs, engine, children }: { title: string; cols: number; everyMs: number; engine: SliderEngine; children: ReactNode }) {
  const cards = Children.toArray(children);
  const pages: ReactNode[][] = [];
  for (let i = 0; i < cards.length; i += cols) pages.push(cards.slice(i, i + cols));
  const [page, setPage] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const n = pages.length;

  useEffect(() => {
    const el = box.current;
    const clock = new SwapClock(n, { everyMs, touchHoldMs: engine.touchHoldMs, focusGraceMs: engine.focusGraceMs });
    if (!el || !clock.live || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    const enter = (e: PointerEvent) => clock.pointerEnter(e.pointerType);
    const leave = (e: PointerEvent) => clock.pointerLeave(e.pointerType);
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') clock.touch();
    };
    const fin = () => clock.focusIn();
    const fout = (e: FocusEvent) => {
      if (!e.relatedTarget || !el.contains(e.relatedTarget as Node)) clock.focusOut();
    };
    const vis = () => {
      clock.hidden = document.hidden;
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    el.addEventListener('focusin', fin);
    el.addEventListener('focusout', fout);
    document.addEventListener('visibilitychange', vis);
    const iv = setInterval(() => {
      if (clock.tick()) setPage(clock.page);
    }, TICK_MS);
    return () => {
      clearInterval(iv);
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('focusin', fin);
      el.removeEventListener('focusout', fout);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [n, everyMs, engine]);

  // the shown page's cards fit their badge and swatch line (a hidden page cannot be measured until it shows)
  useEffect(() => {
    const el = box.current?.children[page];
    if (el) fitAll(el, CARD_FIT);
  }, [page]);

  return (
    <>
      <div className="sec-hd">
        <h2 className="h2">{title}</h2>
        {n > 1 ? (
          <span className="ob-rv-dots" aria-hidden="true">
            {pages.map((_, i) => (
              <i key={i} className={i === page ? 'on' : undefined} />
            ))}
          </span>
        ) : null}
      </div>
      <div ref={box} className="ob-rv-box" data-page={page}>
        {pages.map((p, i) => (
          <div key={i} className="grid g4 ob-rv-grid" hidden={i !== page}>
            {p}
          </div>
        ))}
      </div>
    </>
  );
}
