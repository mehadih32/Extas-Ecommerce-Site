'use client';
// PR 72 — the search window (demo 02-core.js ACT['open-search'] with 07-help-search.js's live suggestions, and D-014's
// desktop panel). Every link marked `data-search-open` opens it — the header's search icon and the phone menu's quick
// "Search" — and without JavaScript the same link simply goes to the results page. A phone (and a computer when
// `search.panel.desktopPanel` is off) gets the bottom window: the box, then the suggestions while typing, otherwise the
// popular words (the owner's; none chosen: the categories). A computer (1024 px and wider) gets the panel dropped under
// the header, the full width of the page. The box is a real form to the results page, so Enter always searches.
// Esc, the close button, a tap outside (or the icon again, on a computer) close it and focus goes back to what opened
// it. This part only listens for the opening click; the window (SearchWindow) is loaded on the first open, so every
// page stays as light as before.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DESK, OPENER, type Mode } from './search-open';
import type { SearchPanelProps } from '@/lib/shop/search-model';

const SearchWindow = lazy(() => import('./SearchWindow'));

export function SearchPanel(p: SearchPanelProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [round, setRound] = useState(0);
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback((focusBack: boolean) => {
    setMode(null);
    const o = opener.current;
    o?.setAttribute('aria-expanded', 'false');
    if (!focusBack) return;
    // the phone menu's "Search" is gone with the menu: the header's icon takes the focus back
    const back = o && document.contains(o) ? o : document.querySelector<HTMLElement>(`.hdr ${OPENER}`);
    requestAnimationFrame(() => back?.focus({ preventScroll: true }));
  }, []);

  // open from any marked link (mouse, touch and keyboard all arrive as a click on the link)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(OPENER);
      if (!el) return;
      e.preventDefault();
      const desk = p.desktopPanel && window.matchMedia(DESK).matches && el.closest('.hdr');
      if (desk && mode === 'desk') {
        close(true);
        return;
      }
      opener.current = el;
      el.setAttribute('aria-expanded', 'true');
      setRound((r) => r + 1);
      setHost(desk ? (el.closest<HTMLElement>('.hdr') ?? null) : (el.closest<HTMLElement>('.shop') ?? document.querySelector<HTMLElement>('.shop') ?? document.body));
      setMode(desk ? 'desk' : 'modal');
    };
    // a finger, a pointer or the keyboard on the link fetches the window's code before the click lands
    const warm = (e: Event) => {
      if ((e.target as Element | null)?.closest?.(OPENER)) void import('./SearchWindow');
    };
    document.addEventListener('click', onClick);
    document.addEventListener('pointerdown', warm, { passive: true });
    document.addEventListener('focusin', warm);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('pointerdown', warm);
      document.removeEventListener('focusin', warm);
    };
  }, [p.desktopPanel, mode, close]);

  if (!mode || !host) return null;
  return (
    <Suspense fallback={null}>
      <SearchWindow key={round} p={p} mode={mode} host={host} close={close} />
    </Suspense>
  );
}
