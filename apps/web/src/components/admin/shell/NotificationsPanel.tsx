'use client';
// PR 626 (CN-036) — the Lumen bell's panel (LUMEN-SPEC §2; NotificationsDrawer's list, PR 12 / 380 / 431, now under the
// bell): the person's own notes (late chats, staff sign-ins from a new device — only what they may see), newest
// first; a note newer than their last "Mark all read" is unread (kept on their account, PUT /api/admin/look
// { scope: "me", seen }); each note opens its page. Esc or a tap outside closes it. Nothing here is a sample.
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from './ShellIcon';

export interface ShellNote {
  id: string;
  title: string;
  body?: string;
  href?: string;
  at?: string;
}

/** Is a note unread (newer than the last "Mark all read"; a note without a time is unread until the first one)? */
export function noteUnread(n: ShellNote, seen: string | null): boolean {
  if (!seen) return true;
  return !!n.at && n.at > seen;
}

export function NotificationsPanel({ dict, items, seen, onMarkAll, onClose }: { dict: Dict; items: ShellNote[] | null; seen: string | null; onMarkAll(): void; onClose(): void }) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(dict, `shell.ntf.${k}`, vars);
  const box = useRef<HTMLDivElement>(null);
  const unread = (items ?? []).filter((n) => noteUnread(n, seen)).length;

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onClose();
      }
    };
    const onDown = (ev: PointerEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el && !box.current?.contains(el) && !el.closest('[data-lm-bell]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  return (
    <div ref={box} className="lm-notif a2-z" role="dialog" aria-label={tt('title')} data-testid="a2-ntf">
      <div className="lm-notif-h">
        <div>
          <h2>{tt('title')}</h2>
          <small>{items === null ? '' : unread ? tt('unread', { n: unread }) : tt('allRead')}</small>
        </div>
        {unread ? (
          <button type="button" className="lm-link" onClick={onMarkAll} data-testid="lm-ntf-markall">
            {tt('markAll')}
          </button>
        ) : null}
      </div>
      {items && items.length ? (
        <ul className="lm-notif-l">
          {items.map((n) => {
            const isNew = noteUnread(n, seen);
            return (
              <li key={n.id}>
                <Link className={`lm-pi${isNew ? ' new' : ''}`} href={n.href ?? '/admin'} onClick={onClose}>
                  <i className="lm-ndot" aria-hidden="true" />
                  <span>
                    <b>{n.title}</b>
                    {n.body ? <small>{n.body}</small> : null}
                  </span>
                  {isNew ? <span className="a2-sr">{tt('new')}</span> : null}
                  <ShellIcon name="cr" size={16} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : items ? (
        <div className="lm-empty" data-testid="a2-ntf-empty">
          <span className="lm-empty-i">
            <ShellIcon name="check" size={22} />
          </span>
          <b>{tt('empty')}</b>
          <small>{tt('emptyNote')}</small>
        </div>
      ) : (
        <div className="lm-skel" aria-busy="true">
          <i />
          <i />
        </div>
      )}
      <p className="lm-notif-note">{tt('note')}</p>
    </div>
  );
}
