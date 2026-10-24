'use client';
// PR 41 / 48 · follow-up 36 — a grid of product cards that fits the cards' two tight spots the way the category page
// does (CARD_FIT: the swatches-and-fit line and the picture's badge step their type down, then collapse — never a cut
// word). After the first paint (the TBT budget), and again after a resize or the web fonts arriving, at most once a frame.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { CARD_FIT, fitAll } from '@/lib/shop/fit';
import { afterPaint, type Cancel } from '@/lib/shop/later';

export function CardFits({ className, id, style, children }: { className?: string; id?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let stop: Cancel = afterPaint(() => fitAll(el, CARD_FIT));
    let raf = 0;
    const again = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        stop();
        stop = afterPaint(() => fitAll(el, CARD_FIT));
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
  }, []);
  return (
    <div ref={ref} className={className} id={id} style={style}>
      {children}
    </div>
  );
}
