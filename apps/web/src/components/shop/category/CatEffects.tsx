'use client';
// PR 45–48 — what the category page does in the browser, with no markup of its own:
// - every filter, chip, sort choice, "Clear all" and "Show more" carries its next address (`data-href`, or a link
//   marked `data-nav`); a tap goes there without reloading the page or jumping to the top, the grid dims while the new
//   page is on its way, and the keyboard comes back to the control it was on (demo cat_refresh, TA-2);
// - "+ N more colours" opens the rest of the colour list in place;
// - the quick-chip row keeps its scroll fade only when it really scrolls (demo K2, cat_chiprowFade);
// - the phone's top row and the cards fit their words (demo AUTO-FIT: `.cat-ptools`, the card's fit line and badge).
// The measuring runs after the first paint, one job per task (lib/shop/later), never inside hydration (TBT budget).
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { CARD_FIT, CAT_TOOLS_FIT, fitAll } from '@/lib/shop/fit';
import { series, type Cancel } from '@/lib/shop/later';

function chipFade() {
  const r = document.querySelector<HTMLElement>('.cat-chiprow.cat-ph');
  if (!r) return;
  r.classList.remove('is-scrollable');
  if (r.scrollWidth > r.clientWidth + 1) r.classList.add('is-scrollable');
}

function fits() {
  const root = document.querySelector('.shop');
  if (root) fitAll(root, [CAT_TOOLS_FIT, ...CARD_FIT]);
}

function moreColours(b: HTMLElement) {
  const box = b.closest('.cat-fg');
  if (!box) return;
  const open = b.getAttribute('aria-expanded') !== 'true';
  box.querySelectorAll<HTMLElement>('.cat-more-c').forEach((x) => (x.hidden = !open));
  if (!b.dataset.more) b.dataset.more = b.textContent ?? '';
  b.textContent = open ? (b.dataset.less ?? '') : b.dataset.more;
  b.setAttribute('aria-expanded', String(open));
}

export function CatEffects({ version }: { version: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const focusKey = useRef<string | null>(null);

  useEffect(() => {
    const go = (href: string, from: Element | null) => {
      focusKey.current = (from instanceof HTMLElement && from.dataset.fk) || null;
      start(() => router.replace(href, { scroll: false }));
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const more = t.closest<HTMLElement>('[data-more-colours]');
      if (more) {
        moreColours(more);
        return;
      }
      const a = t.closest<HTMLAnchorElement>('a[data-nav]');
      if (a) {
        e.preventDefault();
        go(a.pathname + a.search, a);
        return;
      }
      const el = t.closest<HTMLElement>('[data-href]');
      if (!el || el instanceof HTMLInputElement || (el as HTMLButtonElement).disabled) return;
      // a pill or a switch answers at once; the page drawn next confirms it
      if (el.classList.contains('cat-sz') || el.classList.contains('chip')) el.classList.toggle('on');
      go(el.dataset.href!, el);
    };
    const onChange = (e: Event) => {
      const el = e.target instanceof HTMLInputElement ? e.target : null;
      if (el?.dataset.href) go(el.dataset.href, el);
    };
    // capture: a sort choice's own handler closes its menu, and the choice must be read before it goes
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onChange, true);
    };
  }, [router]);

  // the grid dims while the next page is on its way
  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.cat-main, [data-cat-sheet]').forEach((m) => {
      if (pending) m.dataset.busy = '';
      else delete m.dataset.busy;
    });
    if (pending) return;
    const k = focusKey.current;
    focusKey.current = null;
    if (!k) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.isConnected) return;
    const sheet = document.querySelector('[data-cat-sheet]');
    const el = (sheet ?? document).querySelector<HTMLElement>(`[data-fk="${k.replace(/["\\]/g, '')}"]`);
    if (el && el.getClientRects().length) el.focus({ preventScroll: true });
  }, [pending]);

  // fits and the chip fade: after the paint, after every new page, after a resize or the fonts arriving
  useEffect(() => {
    let stop: Cancel = series([chipFade, fits]);
    let raf = 0;
    const again = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        stop();
        stop = series([chipFade, fits]);
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
  }, [version]);

  return null;
}
