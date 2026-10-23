'use client';
// PR 47 — the sort control (demo 21-category.js cat_sortCtl, owner point 14): never a native <select>, which a phone
// draws as a sheet glued to the bottom of the screen. A button with our own list under it, a real listbox: the arrow
// keys, Home and End move through the choices, Enter or Space picks, Escape and Tab close it, a tap anywhere else closes
// it, and the keyboard goes back to the button every time (TA-2 T10). Picking follows the choice's own address
// (`data-href`, CatEffects goes there without reloading the page).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';

export interface SortChoice {
  id: string;
  text: string;
  href: string;
  on: boolean;
}

export function CatSort({ loc, label, choices }: { loc: 'p' | 'd'; label: string; choices: SortChoice[] }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const cur = choices.find((x) => x.on) ?? choices[0];

  const close = useCallback((focusBack: boolean) => {
    setOpen(false);
    if (focusBack) requestAnimationFrame(() => btn.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const opts = (): HTMLElement[] => Array.from(menu.current?.querySelectorAll('[role="option"]') ?? []) as HTMLElement[];
    (opts().find((o) => o.getAttribute('aria-selected') === 'true') ?? opts()[0])?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const list = opts();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const go = (i: number) => {
        e.preventDefault();
        list[(i + list.length) % list.length]?.focus({ preventScroll: true });
      };
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'ArrowDown') go(at + 1);
      else if (e.key === 'ArrowUp') go(at - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(list.length - 1);
      else if (e.key === 'Tab') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // a page drawn again (a filter changed under it) closes a menu left open (checked while drawing, not in an effect)
  const [drawnFor, setDrawnFor] = useState(cur?.id);
  if (drawnFor !== cur?.id) {
    setDrawnFor(cur?.id);
    setOpen(false);
  }

  if (!cur) return null;
  return (
    <div className={`cat-sortwrap${open ? ' is-open' : ''}`}>
      <button
        ref={btn}
        type="button"
        className="btn btn-ghost cat-sortbtn"
        data-fk={`${loc}-sort`}
        data-testid={`cat-sort-btn-${loc}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${cur.text}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="cat-sortv">{cur.text}</span>
        <Icon name="down" size={15} />
      </button>
      {open ? (
        <>
          <div className="cat-sortveil" aria-hidden="true" onClick={() => close(true)} />
          <div ref={menu} className="cat-sortmenu" role="listbox" aria-label={label} data-testid="cat-sort-menu">
            {choices.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`cat-sortopt${s.on ? ' on' : ''}`}
                role="option"
                aria-selected={s.on}
                tabIndex={-1}
                data-href={s.on ? undefined : s.href}
                onClick={() => close(true)}
              >
                <span>{s.text}</span>
                {s.on ? <Icon name="check" size={17} /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
