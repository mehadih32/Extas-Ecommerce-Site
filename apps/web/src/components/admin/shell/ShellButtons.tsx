'use client';
// PR 12 — the few buttons a page drawn on the server needs from the shell: open this section's guide, open search,
// and "More ▾" of the section tabs (a small menu; Esc or a click outside closes it).
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { openGuide, openPalette } from './events';
import { ShellIcon } from './ShellIcon';

// PR 594 (CN-026): the guide button opens the guide of the page it is on (its section's overview above it); `slug`
// names the section guide the page belonged to before page guides, kept on the button for the tests and the smoke run.
// `page` opens one guide instead (Help & manual's rows: `<section>/index`, the section's overview).
export function GuideButton({ slug, section, label, ghost, page }: { slug: string; section: string; label: string; ghost?: boolean; page?: string }) {
  return (
    <button type="button" className={ghost ? 'a2-btn ghost' : 'a2-guide'} lang="bn" onClick={() => openGuide(page ? { page, section } : { path: window.location.pathname, section })} data-testid="a2-guide" data-guide={slug}>
      <ShellIcon name="book" size={ghost ? 15 : 16} />
      {label}
    </button>
  );
}

export function SearchButton({ label }: { label: string }) {
  return (
    <button type="button" className="a2-btn pri" onClick={() => openPalette()}>
      <ShellIcon name="search" size={15} />
      {label}
    </button>
  );
}

/**
 * PR 727: the row of main tabs. On a phone the row scrolls sideways, so the open tab could sit out of sight and no tab
 * looked marked; it is brought to the middle of the row when the page opens (the row only, never the page).
 */
export function TabsRow({ children }: { children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector<HTMLElement>('.on');
    if (!el || !on) return;
    const left = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
    if (left > 0) el.scrollLeft = left;
  }, []);
  return (
    <div className="a2-tabs-s" ref={row}>
      {children}
    </div>
  );
}

export interface MoreLink {
  href: string;
  label: string;
  on: boolean;
}

export function MoreTabs({ label, links }: { label: string; links: MoreLink[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const on = links.find((l) => l.on);
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (!box.current?.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="a2-more" ref={box}>
      <button type="button" className={`a2-tab${on ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="a2-more">
        {on ? on.label : label}
        <ShellIcon name="cd" size={14} />
      </button>
      {open ? (
        <div className="a2-morepop">
          <div className="a2-menu" role="menu">
            {links.map((l) => (
              <Link key={l.href} className={`a2-mi${l.on ? ' on' : ''}`} role="menuitem" href={l.href} aria-current={l.on ? 'page' : undefined} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface FitTab extends MoreLink {
  id: string;
}

/** A laptop's width and up (the shell's own break, shell.css): there the tabs stay in one row and "More" appears only when they cannot fit. */
const LAPTOP = 900;

/**
 * Final round (prototype v5): every tab of the section sits in the row. Below a laptop's width the row scrolls sideways
 * (nothing is hidden). On a laptop or larger screen "More" appears only for the tabs that truly do not fit, the last
 * ones first, and it is measured again when the window or the fonts change.
 */
export function FitTabs({ tabs, moreLabel }: { tabs: FitTab[]; moreLabel: string }) {
  const nav = useRef<HTMLDivElement>(null);
  const widths = useRef<number[]>([]);
  const [shown, setShown] = useState(tabs.length);
  const [measure, setMeasure] = useState(0);
  const all = shown === tabs.length;
  // 1. With every tab drawn, take its width, then decide how many fit.
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const row = el.querySelector<HTMLElement>('.a2-tabs-s');
    if (all && row) {
      const items = Array.from(row.children) as HTMLElement[];
      if (items.length === tabs.length) widths.current = items.map((i) => i.getBoundingClientRect().width);
    }
    const w = widths.current;
    if (w.length !== tabs.length) return;
    const room = el.clientWidth;
    if (window.innerWidth < LAPTOP) return void (shown !== tabs.length && setShown(tabs.length));
    const gap = 2;
    const total = w.reduce((a, b) => a + b + gap, 0);
    if (total <= room) return void (shown !== tabs.length && setShown(tabs.length));
    const moreW = 110;
    let used = moreW;
    let n = 0;
    for (const x of w) {
      if (used + x + gap > room) break;
      used += x + gap;
      n += 1;
    }
    n = Math.max(1, n);
    if (n !== shown) setShown(n);
  }, [measure, all, shown, tabs.length]);
  // 2. Measure again when the window or the fonts change: show all once, then fit.
  useEffect(() => {
    const again = () => {
      setShown(tabs.length);
      setMeasure((m) => m + 1);
    };
    let last = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== last) {
        last = window.innerWidth;
        again();
      }
    };
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(again);
    return () => window.removeEventListener('resize', onResize);
  }, [tabs.length]);
  const row = tabs.slice(0, shown);
  const more = tabs.slice(shown);
  return (
    <div className="a2-tabs-fit" ref={nav}>
      <TabsRow>
        {row.map((x) => (
          <Link key={x.id} className={`a2-tab${x.on ? ' on' : ''}`} href={x.href} aria-current={x.on ? 'page' : undefined}>
            {x.label}
          </Link>
        ))}
      </TabsRow>
      {more.length ? <MoreTabs label={moreLabel} links={more} /> : null}
    </div>
  );
}
