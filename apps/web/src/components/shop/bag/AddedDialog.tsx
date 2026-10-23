'use client';
// PR 106 — what makes the added-to-bag panel a popup: the page behind is locked while it is open and unlocked at the
// same scroll spot when it closes (✕, "Keep shopping", Esc, a tap on the dark backdrop, or the browser's Back), focus
// goes into the panel and back to the Add button after (L33.24, L33.25). On a computer, "Complete the look" shows as
// many rows as fit at least `bag.panel.gapPx` under the buttons (CN-012 fill rule `fit`), or a fixed number, or none.
import { picksThatFit } from '@extas/cart/pure';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { focusOpener } from './opener';

export function AddedDialog({ closeHref, fill, picks, gapPx, children }: { closeHref: string; fill: 'fit' | 'fixed' | 'off'; picks: number; gapPx: number; children: ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = box.current;
    const dialog = root?.querySelector<HTMLElement>('[role="dialog"]');
    if (!root || !dialog) return;
    const y = window.scrollY;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.focus({ preventScroll: true });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      router.replace(closeHref, { scroll: false });
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close();
    };
    const onClick = (ev: MouseEvent) => {
      const el = ev.target as Element;
      if (el.closest('[data-added-close]') || (el.matches('[data-added-back]') && !el.closest('[role="dialog"]'))) close();
    };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', onClick);

    // CN-012 · the fill rule for "Complete the look" (computer drawer only).
    const fit = () => {
      const area = root.querySelector<HTMLElement>('[data-added-picks]');
      if (!area || !area.offsetParent) return;
      const items = [...area.querySelectorAll<HTMLElement>('.atb-xi')];
      for (const i of items) i.style.display = '';
      const perRow = Math.max(1, getComputedStyle(area).gridTemplateColumns.split(' ').filter(Boolean).length);
      const rows: number[] = [];
      for (let r = 0; r < items.length; r += perRow) rows.push(Math.max(...items.slice(r, r + perRow).map((x) => x.getBoundingClientRect().height)));
      const scroller = dialog.lastElementChild as HTMLElement | null;
      const bottom = (scroller ?? dialog).getBoundingClientRect().bottom - parseFloat(getComputedStyle(scroller ?? dialog).paddingBottom || '0');
      const head = area.querySelector<HTMLElement>('.atb-xh');
      const start = (head ?? area).getBoundingClientRect().bottom;
      const rowGap = parseFloat(getComputedStyle(area).rowGap || '0') || 0;
      const { shown } = picksThatFit({ mode: fill, count: Math.min(picks, items.length), available: bottom - start, rowHeights: rows, gap: Math.max(0, gapPx - rowGap), rowGap, perRow });
      items.forEach((x, n) => (x.style.display = n < shown ? '' : 'none'));
      area.hidden = shown === 0;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => {
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('click', onClick);
      window.removeEventListener('resize', fit);
      document.body.style.overflow = prev;
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
      focusOpener();
    };
  }, [router, closeHref, fill, picks, gapPx]);

  return <div ref={box}>{children}</div>;
}
