'use client';
// PR 12 (CN-025) — the "…" menu on a redesigned page (demo 97z-adm2-rd1-core.js a3More): the page's own actions (links
// and a CSV download of the figures on the page), then "Page design (just for you)": every design of the page, the one
// in use ticked; choosing one saves it on the person's account (PUT /api/admin/look, scope "me") and redraws the page;
// "Use the team default" clears it; "All designs in Settings" opens Settings → Admin look. The design list shows only
// while the team allows a personal choice (`admin.look.perPerson`). Esc or a click outside closes it.
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { ShellIconName } from '@/lib/admin-shell/icons';

export interface Csv {
  name: string;
  rows: string[][];
}

export interface LookMenuProps {
  page: string;
  designs: { key: string; name: string }[];
  current: string;
  /** The person picked their own design for this page. */
  mine: boolean;
  perPerson: boolean;
  settingsHref: string | null;
  items: { href: string; label: string; icon: ShellIconName }[];
  csv: Csv | null;
  labels: { more: string; design: string; team: string; all: string; csv: string; saved: string; failed: string };
  testId?: string;
}

/** A CSV text (every cell quoted, quotes doubled, a BOM so spreadsheet apps read Bengali). */
export function csvText(rows: readonly (readonly string[])[]): string {
  return `﻿${rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')}\r\n`;
}

export function downloadCsv(csv: Csv): void {
  const url = URL.createObjectURL(new Blob([csvText(csv.rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = csv.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function CsvButton({ csv, label }: { csv: Csv; label: string }) {
  return (
    <button type="button" className="a3-btn ic" aria-label={label} title={label} onClick={() => downloadCsv(csv)} data-testid="look-csv">
      <ShellIcon name="dl" size={17} />
    </button>
  );
}

export function LookMenu(p: LookMenuProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const path = usePathname() ?? '/admin';
  const search = useSearchParams();
  const box = useRef<HTMLDivElement | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (design: string | null) => {
    setOpen(false);
    start(async () => {
      const res = await fetch('/api/admin/look', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'me', page: p.page, design }),
      }).catch(() => null);
      if (!res?.ok) {
        setNote(p.labels.failed);
        return;
      }
      setNote(p.labels.saved);
      // A preview (?design=) gives way to the saved choice.
      if (search?.get('design')) {
        const q = new URLSearchParams(search.toString());
        q.delete('design');
        router.replace(q.size ? `${path}?${q.toString()}` : path, { scroll: false });
      }
      router.refresh();
    });
  };

  return (
    <div className="a3-more" ref={box} data-testid={p.testId ?? 'look-more'}>
      <button ref={btn} type="button" className="a3-btn ic" aria-haspopup="menu" aria-expanded={open} aria-label={p.labels.more} title={p.labels.more} onClick={() => setOpen(!open)} disabled={busy}>
        <ShellIcon name="more" size={18} stroke={2.6} />
      </button>
      {note ? (
        <span className="a2-sr" role="status">
          {note}
        </span>
      ) : null}
      {open ? (
        <div className="a3-mpop">
          <div className="a2-menu a3-menu" role="menu" aria-label={p.labels.more}>
            {p.items.map((it) => (
              <Link key={it.href} className="a2-mi" role="menuitem" href={it.href} onClick={() => setOpen(false)}>
                <ShellIcon name={it.icon} size={16} />
                <span>{it.label}</span>
              </Link>
            ))}
            {p.csv ? (
              <button
                type="button"
                className="a2-mi"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  downloadCsv(p.csv!);
                }}
              >
                <ShellIcon name="dl" size={16} />
                <span>{p.labels.csv}</span>
              </button>
            ) : null}
            {p.perPerson && p.designs.length > 1 ? (
              <>
                {p.items.length || p.csv ? <div className="a2-hr" role="separator" style={{ margin: '6px 0' }} /> : null}
                <div className="a2-mh">{p.labels.design}</div>
                {p.designs.map((d) => {
                  const on = d.key === p.current;
                  return (
                    <button key={d.key} type="button" className={`a2-mi a3-dmi${on ? ' on' : ''}`} role="menuitemradio" aria-checked={on} onClick={() => choose(d.key)} data-testid={`look-pick-${d.key}`}>
                      <span className="a3-dl">{d.key}</span>
                      <span>{d.name}</span>
                      {on ? <ShellIcon name="check" size={15} /> : null}
                    </button>
                  );
                })}
                {p.mine ? (
                  <button type="button" className="a2-mi" role="menuitem" onClick={() => choose(null)} data-testid="look-pick-team">
                    <ShellIcon name="undo" size={15} />
                    <span>{p.labels.team}</span>
                  </button>
                ) : null}
              </>
            ) : null}
            {p.settingsHref ? (
              <Link className="a2-mi" role="menuitem" href={p.settingsHref} onClick={() => setOpen(false)}>
                <ShellIcon name="palette" size={15} />
                <span>{p.labels.all}</span>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
