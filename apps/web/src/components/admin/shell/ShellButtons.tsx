'use client';
// PR 12 — the few buttons a page drawn on the server needs from the shell: open this section's guide, open search,
// and "More ▾" of the section tabs (a small menu; Esc or a click outside closes it).
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { openGuide, openPalette } from './events';
import { ShellIcon } from './ShellIcon';

export function GuideButton({ slug, section, label, ghost }: { slug: string; section: string; label: string; ghost?: boolean }) {
  return (
    <button type="button" className={ghost ? 'a2-btn ghost' : 'a2-guide'} lang="bn" onClick={() => openGuide({ slug, section })} data-testid="a2-guide" data-guide={slug}>
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
