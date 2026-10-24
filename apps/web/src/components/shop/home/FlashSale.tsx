'use client';
// PR 44 — the flash sale's live parts (demo 20-home.js hm_flash; §58.11: the clock must tick). <FlashSection> holds the
// time left and draws the server-made section until the clock reaches zero, then draws nothing (the section hides
// itself). <FlashClock> shows hours : minutes : seconds, numbers only (§57.1), with "Ends in" on one line before them.
//
// The page is drawn with the time left when the server drew it, so the first paint and the browser's first render
// agree; the ticking starts after the first paint (the TBT budget, later.ts) and reads the clock every time (never a
// count of ticks, so a slow or hidden tab is right again at its next tick). A phone clock set wrong is not trusted
// (flash-model `clockDeadline`). The heading row fits a narrow phone (FLASH_HEAD_FIT) as the section nears the screen,
// again on a resize or the fonts.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { clockDeadline, clockParts, nextTickMs } from '@/lib/shop/flash-model';
import { FLASH_HEAD_FIT, fitAll } from '@/lib/shop/fit';
import { afterPaint, whenNear, type Cancel } from '@/lib/shop/later';
import { toBnDigits } from '@/lib/shop/lang';

const Left = createContext<number>(0);

export function FlashSection({ endsAt, serverNow, testId, children }: { endsAt: number; serverNow: number; testId?: string; children: ReactNode }) {
  const [left, setLeft] = useState(endsAt - serverNow);
  const over = left <= 0;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const deadline = clockDeadline(endsAt, serverNow, Date.now());
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const ms = deadline - Date.now();
      setLeft(ms);
      if (ms > 0) t = setTimeout(tick, nextTickMs(ms));
    };
    const stop = afterPaint(tick);
    // a tab that slept wakes with the right time at once
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(t);
      tick();
    };
    document.addEventListener('visibilitychange', wake);
    return () => {
      stop();
      clearTimeout(t);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [endsAt, serverNow]);
  useEffect(() => {
    const el = ref.current;
    if (!el || over) return;
    // the section sits well below the first screen (its layout waits too, shop.css .hm-flash): fit it as it nears
    let near = false;
    let stop: Cancel = whenNear(el, () => {
      near = true;
      fitAll(el, [FLASH_HEAD_FIT]);
    });
    let raf = 0;
    const again = () => {
      if (raf || !near) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        stop();
        stop = afterPaint(() => fitAll(el, [FLASH_HEAD_FIT]));
      });
    };
    window.addEventListener('resize', again);
    document.fonts?.addEventListener?.('loadingdone', again);
    return () => {
      stop();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', again);
      document.fonts?.removeEventListener?.('loadingdone', again);
    };
  }, [over]);
  if (over) return null;
  return (
    <section ref={ref} className="section hm-flash" data-testid={testId}>
      <Left.Provider value={left}>{children}</Left.Provider>
    </section>
  );
}

/** `label`: "Ends in"; `aria`: the clock read out, {h} hours and {m} minutes; `bn`: Bengali digits. */
export function FlashClock({ label, aria, bn }: { label: string; aria: string; bn: boolean }) {
  const p = clockParts(useContext(Left));
  const d = (s: string) => (bn ? toBnDigits(s) : s);
  const said = aria.replace('{h}', d(String(p.hours))).replace('{m}', d(String(p.minutes)));
  return (
    <div className="hm-cd-wrap" data-testid="hm-flash-clock">
      <span className="xs muted bold hm-cd-lbl">{label}</span>
      <div className="hm-cd-row" role="timer" aria-label={said}>
        <span className="hm-cd">{d(p.h)}</span>
        <span className="hm-cd-sep" aria-hidden="true">
          :
        </span>
        <span className="hm-cd">{d(p.m)}</span>
        <span className="hm-cd-sep" aria-hidden="true">
          :
        </span>
        <span className="hm-cd">{d(p.s)}</span>
      </div>
    </div>
  );
}
