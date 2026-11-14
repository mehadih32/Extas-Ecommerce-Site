// PR 722 (prototype v5 parity, m-orders.js "All orders"): the three buttons at the right of the title — Export, New bulk
// order and Phone order (the primary one). Export is the order list's own CSV route with the page's own filters
// (`GET /api/admin/orders/export`, `orders.export`, checked again there), New bulk order opens Orders → Bulk. Phone order
// needs an order-taking service this shop has not got yet, so it is drawn OFF with its reason (CLAUDE.md: a clear "off"
// state, never a button that does nothing).
import Link from 'next/link';
import type { ListQuery } from '@/lib/admin-orders/model';
import type { AdminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';

const EXPORT_KEYS = ['view', 'status', 'q', 'payment', 'source'] as const;

/** The export address for the page's filters (only the keys the export route reads). */
export function exportHref(query: ListQuery): string {
  const p = new URLSearchParams();
  for (const k of EXPORT_KEYS) {
    const v = query[k];
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return `/api/admin/orders/export${s ? `?${s}` : ''}`;
}

export function OrderHeaderActions({ view, query, perms }: { view: AdminView; query: ListQuery; perms: ReadonlySet<string> }) {
  const d = view.dict;
  return (
    <div className="a2-gap8" data-testid="orders-actions">
      {perms.has('orders.export') ? (
        <a className="a2-btn" href={exportHref(query)} download data-testid="orders-export">
          <ShellIcon name="dl" size={15} />
          {t(d, 'orders.list.actions.export')}
        </a>
      ) : null}
      <Link className="a2-btn" href="/admin/orders/bulk" data-testid="orders-bulk-new">
        <ShellIcon name="plus" size={15} />
        {t(d, 'orders.list.actions.bulk')}
      </Link>
      <button type="button" className="a2-btn pri is-off" disabled title={t(d, 'orders.list.actions.phoneOff')} data-testid="orders-phone">
        <ShellIcon name="phone" size={15} />
        {t(d, 'orders.list.actions.phone')}
      </button>
    </div>
  );
}
