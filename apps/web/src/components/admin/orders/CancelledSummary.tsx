// PR 660 (CN-048, GAP-MAP O-28) — the Cancelled summary card above the Cancelled view of the order lists (All orders in
// every design). Read only: counts, the order value that did not come in, the reason split, the stage and who. The
// two file buttons are in CancelledFiles (a browser part).
import * as od from '@extas/orders';
import type { AdminView } from '@/lib/admin-page';
import { cancelledCard } from '@/lib/admin-orders/cancelled';
import type { ListQuery } from '@/lib/admin-orders/model';
import { t } from '@/lib/i18n';
import { CancelledFiles } from './CancelledFiles';
import type { ListAccess } from './OrderListPage';

export async function CancelledSummary({ view, a, query }: { view: AdminView; a: ListAccess; query: ListQuery }) {
  if (query.view !== 'cancelled') return null;
  const deps: od.OrdersDeps = { db: a.deps.db, settings: a.deps.resolver, now: a.deps.now };
  const [summary, lists] = await Promise.all([od.cancelledSummary(deps, a.who, { ...(query.from ? { from: query.from } : {}), ...(query.to ? { to: query.to } : {}) }), od.reasonLists(deps, a.who.storeId)]);
  const reasons = new Map(lists.cancel.map((r) => [r.key, view.lang === 'bn' ? r.bn || r.en : r.en]));
  const c = cancelledCard(view, summary, reasons);
  const d = view.dict;
  return (
    <section className="a2-card" data-testid="cancelled-summary" aria-label={c.title}>
      <div className="a2-row a2-r12">
        <div>
          <h2 className="a2-h3">{c.title}</h2>
          <div className="a2-xs a2-mute">{c.sub}</div>
        </div>
        <CancelledFiles
          from={query.from}
          to={query.to}
          canExport={a.perms.has('orders.export')}
          labels={{ excel: t(d, 'orders.cancelled.excel'), pdf: t(d, 'orders.cancelled.pdf'), failed: t(d, 'orders.bulk.more.fileFailed'), noRight: t(d, 'orders.bulk.more.fileNoRight') }}
        />
      </div>
      <div className="a2-hist a2-mt12">
        {c.tiles.map((x) => (
          <div key={x.key} data-k={x.key}>
            <b>{x.value}</b>
            <span>{x.label}</span>
          </div>
        ))}
      </div>
      {c.empty ? <div className="a2-xs a2-mute a2-mt12">{c.empty}</div> : null}
      {c.groups.map((g) => (
        <div key={g.key} data-testid={`cancelled-${g.key}`}>
          <h3 className="a2-sm a2-mt12">{g.title}</h3>
          {g.rows.map((r) => (
            <div key={r.label} className="a2-rule">
              <span>{r.label}</span>
              <b className="a2-num">{r.count}</b>
            </div>
          ))}
        </div>
      ))}
      <div className="a2-xs a2-mute a2-mt12">{c.note}</div>
    </section>
  );
}
