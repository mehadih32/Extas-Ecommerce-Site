// Inbox (prototype v5, m-inbox.js renderChats): the rows of the left pane. The same rows sit on the Inbox page and beside
// an open conversation, so the three panes (list, thread, customer) are one screen on a laptop. Nothing here changes data.
import Link from 'next/link';
import type { InboxRow } from '@extas/support';
import { ago, kindName, span } from '@/lib/admin-support/i18n';
import { t, type Dict } from '@/lib/i18n';

const HERE = '/admin/support';

const statusTone = (s: string) => (s === 'OPEN' ? 'warn' : s === 'SOLVED' ? 'ok' : 'info');

/** Whether the row is the one open in the middle pane. */
export function isActive(id: string, activeId: string | undefined): boolean {
  return !!activeId && id === activeId;
}

export function InboxRows({ rows, d, locale, me, now, activeId }: { rows: readonly InboxRow[]; d: Dict; locale: string; me: string | null; now: Date; activeId?: string }) {
  return (
    <ul className="sp-list" data-testid="support-list">
      {rows.map((r) => {
        const name = r.contact.name ?? r.contact.phone ?? t(d, 'sup.unnamed');
        const preview = r.lastPreview ? (r.lastDirection === 'OUT' ? t(d, 'sup.lastOut', { text: r.lastPreview }) : r.lastPreview) : (r.subject ?? '');
        const on = isActive(r.id, activeId);
        return (
          <li key={r.id}>
            <Link className={`sp-row${on ? ' on' : ''}`} href={`${HERE}/c/${r.id}`} data-testid="support-row" data-status={r.status} aria-current={on ? 'page' : undefined}>
              <span className="sp-av" aria-hidden="true">
                {name.trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="sp-body">
                <span className="sp-top">
                  <b>{name}</b>
                  {r.contact.name && r.contact.phone ? <span className="a2-xs a2-mute a2-mono">{r.contact.phone}</span> : null}
                  <span className="sp-when">{ago(d, locale, r.lastMessageAt, now)}</span>
                </span>
                <span className="sp-prev">{preview}</span>
                <span className="sp-meta">
                  <span className={`a2-pill ${statusTone(r.status)}`}>{t(d, `sup.status.${r.status}`)}</span>
                  <span className="a2-pill line">{kindName(d, r.channel.kind)}</span>
                  {r.assignedTo ? <span>{r.assignedTo.id === me ? t(d, 'lf.ib.you') : r.assignedTo.name}</span> : <span className="a2-pill warn">{t(d, 'lf.ib.noOwner')}</span>}
                  {r.waitingSince && r.status !== 'SOLVED' ? <span>· {t(d, 'sup.waitingFor', { time: ago(d, locale, r.waitingSince, now) })}</span> : null}
                  {r.clock ? (
                    <span className={`a2-pill ${r.clock.late ? 'bad' : 'line'}`} data-testid="support-row-clock" data-late={r.clock.late ? 'yes' : 'no'}>
                      {t(d, `sup.clock.${r.clock.stage}${r.clock.late ? 'Late' : ''}`, { time: span(d, locale, Math.abs(r.clock.dueAt.getTime() - now.getTime()) / 60_000) })}
                    </span>
                  ) : null}
                  <span className="a2-mono">· {r.refCode}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
