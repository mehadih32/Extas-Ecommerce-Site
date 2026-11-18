// PR 828 / PR 1120 (prototype v5, the call desk): the two read-only cards over the call queue, "Call desk" (who called and
// confirmed today) and "Call again now (n)" (the calls whose next try is due). Drawn on Calls to make and, as in the
// prototype, on top of Orders › Processing. Nothing here calls, confirms or changes an order.
import Link from 'next/link';
import { Fragment } from 'react';
import type * as od from '@extas/orders';
import { reasonLabel } from '@/lib/admin-orders/calls-view';
import type { Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';

export function CallDeskCards({ d, desk, w, n }: { d: Dict; desk: od.CallDesk; w: (k: string, vars?: Record<string, string | number>) => string; n: (x: number) => string }) {
  return (
    <div className="d4-desk a2-mt12" data-testid="call-desk">
      <section className="a2-card" aria-label={w('desk.h')} data-testid="call-desk-staff">
        <h2 className="a2-h4">{w('desk.h')}</h2>
        <p className="a2-xs a2-mute">{w('desk.sub')}</p>
        {desk.staff.length ? (
          <div className="d4-st a2-mt12">
            <span className="a2-xs a2-mute">{w('desk.staff')}</span>
            <span className="a2-xs a2-mute r">{w('desk.calls')}</span>
            <span className="a2-xs a2-mute r">{w('desk.confirmed')}</span>
            <span className="a2-xs a2-mute r">{w('desk.noAnswer')}</span>
            {desk.staff.map((x) => (
              <Fragment key={x.staffUserId}>
                <span>{x.name}</span>
                <b className="r">{n(x.calls)}</b>
                <b className="r">{n(x.confirmed)}</b>
                <b className="r">{n(x.noAnswer)}</b>
              </Fragment>
            ))}
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12">{w('desk.noStaff')}</p>
        )}
      </section>
      <section className="a2-card" aria-label={w('desk.dueH', { n: n(desk.dueTotal) })} data-testid="call-desk-due">
        <h2 className="a2-h4">{w('desk.dueH', { n: n(desk.dueTotal) })}</h2>
        <p className="a2-xs a2-mute">{w('desk.dueSub')}</p>
        {desk.due.length ? (
          desk.due.map((x) => (
            <div key={x.taskId} className="a2-between d4-li" data-testid="call-desk-due-row">
              <span className="a2-ell">
                <b className="a2-mono">{x.order?.number ?? '—'}</b> · {x.order?.customerName ?? ''} · {reasonLabel(d, x.reason)}
                {x.tries ? ` · ${w('desk.tries', { n: n(x.tries) })}` : ''}
              </span>
              {x.order ? (
                <Link className="a2-btn sm pri" href={`/admin/orders/${x.order.id}`} data-testid="call-desk-call">
                  <ShellIcon name="phone" size={14} />
                  {w('desk.call')}
                </Link>
              ) : null}
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute a2-mt12 d4-none">{w('desk.noneDue')}</p>
        )}
      </section>
    </div>
  );
}
