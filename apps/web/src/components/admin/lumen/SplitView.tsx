'use client';
// PR 628 (CN-036, LUMEN-SPEC §3 item 4) — list + detail split (Order view, Customers): on a wide screen the list on the
// left and the chosen item's full detail on the right; on a narrower one the list alone, and a press opens the detail
// in the drawer (a bottom sheet on a phone; the shell's Drawer). Either way "Previous" and "Next" move one tap to the
// item before or after, and ↑ ↓ move along the list from the keyboard. The detail arrives from the server already
// drawn, so a page keeps its own sections, links and actions (and their confirmations).
import Link from 'next/link';
import { useCallback, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { Drawer } from '@/components/admin/shell/Drawer';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { useLumen } from './context';
import { EmptyState } from './EmptyState';

export interface SplitItem {
  id: string;
  title: string;
  sub?: string;
  /** A small thing on the right of the list row (a status pill, an amount). */
  meta?: ReactNode;
  detail: ReactNode;
  /** The item's own full page (optional). */
  href?: string;
}

export interface SplitViewProps {
  items: readonly SplitItem[];
  initial?: string;
  listLabel: string;
  empty: { title: string; text?: string };
  testId?: string;
}

/** Below this width the detail opens in the drawer (the shell keeps its sidebar beside the list above it). */
const NARROW = '(max-width: 1023px)';
const sub = (cb: () => void) => {
  const m = window.matchMedia(NARROW);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};

export function SplitView({ items, initial, listLabel, empty, testId = 'lm-split' }: SplitViewProps) {
  const { lt } = useLumen();
  const narrow = useSyncExternalStore(
    sub,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  const [sel, setSel] = useState(initial && items.some((i) => i.id === initial) ? initial : (items[0]?.id ?? ''));
  const [sheet, setSheet] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const idx = Math.max(0, items.findIndex((i) => i.id === sel));
  const cur = items[idx];
  const close = useCallback(() => setSheet(false), []);

  const go = (i: number, focus = false) => {
    const it = items[Math.max(0, Math.min(items.length - 1, i))];
    if (!it) return;
    setSel(it.id);
    if (focus) list.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(it.id)}"]`)?.focus();
  };
  const onKey = (ev: KeyboardEvent<HTMLUListElement>) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      go(idx + (ev.key === 'ArrowDown' ? 1 : -1), true);
    }
  };

  if (!cur) return <EmptyState tone="calm" title={empty.title} text={empty.text} testId={`${testId}-empty`} />;

  const steps = (
    <div className="lm-split-nav">
      <button type="button" className="lm-btn sm" onClick={() => go(idx - 1)} disabled={idx === 0} data-testid={`${testId}-prev`}>
        <ShellIcon name="cl" size={14} />
        {lt('prev')}
      </button>
      <span className="lm-split-pos">{lt('position', { n: idx + 1, of: items.length })}</span>
      <button type="button" className="lm-btn sm" onClick={() => go(idx + 1)} disabled={idx === items.length - 1} data-testid={`${testId}-next`}>
        {lt('next')}
        <ShellIcon name="cr" size={14} />
      </button>
    </div>
  );

  return (
    <div className="lm-split" data-testid={testId}>
      <ul ref={list} className="lm-split-list lm-card" aria-label={listLabel} onKeyDown={onKey}>
        {items.map((it, i) => (
          <li key={it.id}>
            <button
              type="button"
              data-id={it.id}
              className={i === idx ? 'on' : undefined}
              aria-current={i === idx ? 'true' : undefined}
              tabIndex={i === idx ? 0 : -1}
              onClick={() => {
                setSel(it.id);
                if (narrow) setSheet(true);
              }}
              data-testid={`${testId}-item`}
            >
              <span className="lm-split-t">
                <b>{it.title}</b>
                {it.sub ? <small>{it.sub}</small> : null}
              </span>
              {it.meta ? <span className="lm-split-m">{it.meta}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {!narrow ? (
        <section className="lm-split-detail lm-card" aria-label={cur.title} data-testid={`${testId}-detail`}>
          <div className="lm-split-h">
            <div>
              <h2 className="lm-h2">{cur.title}</h2>
              {cur.sub ? <p className="lm-sub">{cur.sub}</p> : null}
            </div>
            {cur.href ? (
              <Link className="lm-btn sm gh" href={cur.href}>
                {lt('openPage')}
              </Link>
            ) : null}
          </div>
          {steps}
          <div className="lm-split-b">{cur.detail}</div>
        </section>
      ) : null}
      {narrow && sheet ? (
        <Drawer title={cur.title} sub={cur.sub} closeLabel={lt('close')} onClose={close} testId={`${testId}-drawer`} foot={steps}>
          {cur.detail}
          {cur.href ? (
            <p>
              <Link className="lm-btn sm gh" href={cur.href}>
                {lt('openPage')}
              </Link>
            </p>
          ) : null}
        </Drawer>
      ) : null}
    </div>
  );
}
