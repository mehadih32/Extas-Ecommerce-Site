'use client';
// PR 12 — SH-03, the notifications drawer: things that happened once, for this person only (GET
// /api/admin/notifications). Until the staff notification store exists (approvals, failed syncs and backups, mentions
// arrive with their PRs) the list is honestly empty; live work waiting sits on the Dashboard under "Needs you now".
import { useEffect, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { Drawer } from './Drawer';
import { ShellIcon } from './ShellIcon';

interface Note {
  id: string;
  title: string;
  body?: string;
  href?: string;
}

export function NotificationsDrawer({ dict, onClose }: { dict: Dict; onClose(): void }) {
  const tt = (k: string) => t(dict, `shell.ntf.${k}`);
  const [items, setItems] = useState<Note[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/admin/notifications', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: Note[] }) => live && setItems(j.items ?? []))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);
  return (
    <Drawer title={tt('title')} closeLabel={tt('close')} onClose={onClose} testId="a2-ntf">
      {items && items.length ? (
        items.map((n) => (
          <a key={n.id} className="a2-task" href={n.href ?? '#'}>
            <span className="a2-tki mute">
              <ShellIcon name="bell" size={16} />
            </span>
            <span className="a2-tkt">
              <b>{n.title}</b>
              {n.body ? <span>{n.body}</span> : null}
            </span>
          </a>
        ))
      ) : items ? (
        <div className="a2-state" data-testid="a2-ntf-empty">
          <div className="a2-sti">
            <ShellIcon name="bell" size={26} />
          </div>
          <h3>{tt('empty')}</h3>
          <p>{tt('emptyNote')}</p>
        </div>
      ) : null}
      <p className="a2-xs a2-mute a2-ntf-note">{tt('note')}</p>
    </Drawer>
  );
}
