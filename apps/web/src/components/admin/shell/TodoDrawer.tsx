'use client';
// PR 12 (CN-025) — the "To do" drawer (demo V12.4 A2.drawers.todo), behind the top bar's tray, the phone bar's "To do",
// the T key and a page's "All lists": every waiting list the person may open, under plain headings (Urgent first), the
// one to start with marked, each with how old its oldest item is. Tabs: All · Mine (the role's own lists,
// `admin.todo.mine`, else its start section's) · Later (lists put aside for `admin.todo.laterHours` hours with the clock
// button; kept in this browser only, and they come back by themselves). A list leaves by itself when its work is done.
import Link from 'next/link';
import { useState } from 'react';
import type { TodoItem } from '@/lib/admin-shell/model';
import { groupTodo, hotOf, pruneLater, splitLater } from '@/lib/admin-shell/todo';
import { t, type Dict } from '@/lib/i18n';
import { Drawer } from './Drawer';
import { openTodo } from './events';
import { ShellIcon } from './ShellIcon';

const LATER_KEY = 'extas-admin-later';
const HOUR = 3_600_000;
/** The clock, read when a button is pressed (never while drawing). */
const clock = () => Date.now();

/** The lists put aside in this browser (an unreadable store is "none"). */
export function readLater(now: number): Record<string, number> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LATER_KEY) ?? '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number') out[k] = v;
    return pruneLater(out, now);
  } catch {
    return {};
  }
}

function writeLater(v: Record<string, number>) {
  try {
    window.localStorage.setItem(LATER_KEY, JSON.stringify(v));
  } catch {
    // A private window may refuse storage: "Later" then lasts until the page is left.
  }
}

/** A button that opens the drawer from a page (design C's "All lists", "Waiting for a decision"). */
export function TodoOpenButton({ className, label, chevron }: { className: string; label: string; chevron?: boolean }) {
  return (
    <button type="button" className={className} onClick={() => openTodo()} data-testid="todo-open">
      {chevron ? null : <ShellIcon name="inbox" size={15} />}
      <span>{label}</span>
      {chevron ? <ShellIcon name="cr" size={14} /> : null}
    </button>
  );
}

type Tab = 'all' | 'mine' | 'later';

export function TodoDrawer({ dict, items, mine, laterHours, later, setLater, now, onClose }: { dict: Dict; items: readonly TodoItem[]; mine: readonly string[] | null; laterHours: number; later: Record<string, number>; setLater(v: Record<string, number>): void; /** When it was opened (ms), for the ages and "Later". */ now: number; onClose(): void }) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(dict, `shell.todo.${k}`, vars);
  const [tab, setTab] = useState<Tab>('all');
  const split = splitLater(items, later, now);
  const mineList = mine ? split.open.filter((i) => mine.includes(i.id)) : [];
  const list = tab === 'later' ? split.later : tab === 'mine' ? mineList : split.open;
  const groups = groupTodo(list);
  const hot = tab === 'later' ? null : hotOf(groups);
  const age = (iso: string | null) => {
    if (!iso) return null;
    const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
    if (min < 1) return t(dict, 'dash.age.now');
    if (min < 60) return t(dict, 'dash.age.m', { n: min });
    const h = Math.floor(min / 60);
    return h < 48 ? t(dict, 'dash.age.h', { n: h }) : t(dict, 'dash.age.d', { n: Math.floor(h / 24) });
  };
  const toggle = (id: string) => {
    const at = clock();
    const next = { ...pruneLater(later, at) };
    if ((next[id] ?? 0) > at) delete next[id];
    else next[id] = at + laterHours * HOUR;
    writeLater(next);
    setLater(next);
  };
  const tabs: [Tab, string, number][] = [
    ['all', tt('all'), split.open.length],
    ...(mine ? ([['mine', tt('mine'), mineList.length]] as [Tab, string, number][]) : []),
    ['later', tt('later'), split.later.length],
  ];
  return (
    <Drawer
      title={tt('title')}
      sub={tt('sub', { n: split.open.length })}
      closeLabel={tt('close')}
      onClose={onClose}
      testId="todo-drawer"
      foot={
        <span className="a3-kh">
          <kbd>T</kbd>
          {tt('keyHint')}
        </span>
      }
    >
      <div className="a3-seg" role="tablist" aria-label={tt('aria')}>
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} data-testid={`todo-tab-${id}`}>
            {label}
            <i>{n}</i>
          </button>
        ))}
      </div>
      {groups.length ? (
        groups.map((g) => (
          <div key={g.group} role="group" aria-label={tt(`groups.${g.group}`)}>
            <div className={`a3-tdg${g.group === 'urgent' ? ' bad' : ''}`}>{tt(`groups.${g.group}`)}</div>
            {g.items.map((it) => {
              const on = it.id === hot;
              const old = age(it.oldest);
              return (
                <div key={it.id} className={`a3-td${on ? ' hot' : ''}`} data-testid="todo-item" data-queue={it.id}>
                  <span className={`a3-tdi ${it.tone}`}>
                    <ShellIcon name={it.icon} size={17} />
                  </span>
                  <Link className="a3-tdt" href={it.href} onClick={onClose}>
                    <b>{t(dict, `dash.queue.${it.id}`)}</b>
                    <span>{old ? t(dict, 'dash.queue.sub', { n: it.n, age: old }) : t(dict, 'shell.nav.waiting', { n: it.n })}</span>
                  </Link>
                  {on ? (
                    <Link className="a3-btn pri sm" href={it.href} onClick={onClose}>
                      {tt('start')}
                      <ShellIcon name="cr" size={15} />
                    </Link>
                  ) : (
                    <span className="a3-tda">{old ?? ''}</span>
                  )}
                  <button
                    type="button"
                    className="a3-btn ic gh sm"
                    onClick={() => toggle(it.id)}
                    aria-label={tab === 'later' ? tt('bringBack') : tt('putAside', { n: laterHours })}
                    title={tab === 'later' ? tt('bringBack') : tt('putAsideShort', { n: laterHours })}
                    data-testid="todo-later"
                  >
                    <ShellIcon name={tab === 'later' ? 'undo' : 'clock'} size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        ))
      ) : (
        <div className="a3-empty" data-testid="todo-empty">
          <ShellIcon name="check" size={22} />
          <b>{tab === 'later' ? tt('asideNone') : tt('clear')}</b>
          <span>{tab === 'later' ? tt('asideNote', { n: laterHours }) : tt('clearNote')}</span>
        </div>
      )}
    </Drawer>
  );
}
