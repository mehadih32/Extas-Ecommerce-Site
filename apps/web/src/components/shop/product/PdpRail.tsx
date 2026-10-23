'use client';
// PR 68 — the floating action rail (demo 30-product.js "pdp-acts", PDP_RAIL): a column of round buttons at the right of
// the product page — the wishlist heart (when the owner puts it here), "Ask about this item on WhatsApp" (only with
// the store's number) — that eases a little with the scroll and settles back, clamped between the title's line and a
// line just above the buy bar (lib/shop/pdp-rail.ts). One frame loop, nothing at all with reduced motion (the clamp
// still holds). Off by default (`pdp.icons.panel`).
import type { PdpIconsSettings } from '@extas/settings';
import { useEffect, useRef, type ReactNode } from 'react';
import { driftTarget, easeStep, railClamp } from '@/lib/shop/pdp-rail';
import { HeartButton, type HeartWords } from '../HeartButton';
import { WaGlyph } from '../Icon';

export interface RailProps {
  set: PdpIconsSettings;
  productId: string;
  /** The WhatsApp link with the product named (null: no number, or switched off). */
  wa: string | null;
  waLabel: string;
  /** The heart's words when the heart rides here (null: it is after the title, or off). */
  heart: HeartWords | null;
  /** More buttons (PR 69: Share) and what they open. */
  children?: ReactNode;
}

/** Paints the rail (and anything that rides with it, `.pdp-rides`) at a drift, clamped. */
function paint(rail: HTMLElement, off: number, set: PdpIconsSettings): void {
  const h = rail.offsetHeight;
  if (!h) return;
  const top = parseFloat(getComputedStyle(rail).top) || 0;
  const title = document.querySelector('.pdp-page .pdp-name');
  const bar = document.querySelector<HTMLElement>('.pdp-mbar');
  const o = railClamp(
    off,
    { natural: top - h / 2, h, titleBottom: title ? title.getBoundingClientRect().bottom : null, vh: window.innerHeight, bar: bar?.offsetHeight ?? 0 },
    set,
  );
  const v = `translateY(calc(-50% + ${o.toFixed(1)}px))`;
  rail.style.transform = v;
  document.querySelectorAll<HTMLElement>('.pdp-page .pdp-rides').forEach((e) => (e.style.transform = v));
}

export function PdpRail({ set, productId, wa, waLabel, heart, children }: RailProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = ref.current;
    if (!rail) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cur = 0;
    let target = 0;
    let raf = 0;
    let stop: ReturnType<typeof setTimeout> | undefined;
    let lastY = window.scrollY;
    const frame = () => {
      const s = easeStep(cur, target, set.ease);
      cur = s.cur;
      paint(rail, cur, set);
      raf = s.done ? 0 : requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (reduced) return paint(rail, 0, set); // no drift, but the clamp still holds
      target = driftTarget(target, dy, set);
      kick();
      paint(rail, cur, set);
      clearTimeout(stop);
      stop = setTimeout(() => {
        target = 0;
        kick();
      }, set.settleMs);
    };
    const onResize = () => paint(rail, cur, set);
    paint(rail, 0, set);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stop);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [set]);

  if (!wa && !heart && !children) return null;
  return (
    <div ref={ref} className="pdp-acts" data-testid="pdp-rail">
      {heart ? <HeartButton id={productId} className="pdp-act pdp-act-wish" size={22} testId="rail-wish" words={heart} /> : null}
      {children}
      {wa ? (
        <a className="pdp-act wa" href={wa} target="_blank" rel="noopener" aria-label={waLabel} title={waLabel} data-testid="rail-wa">
          <WaGlyph size={24} />
        </a>
      ) : null}
    </div>
  );
}
