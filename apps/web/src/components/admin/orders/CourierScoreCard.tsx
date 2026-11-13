// S28 · PR 662 — the courier score card on one order's admin page (staff only, `orders.risk.read`): the score out of 10,
// its one plain reason and the six checks with source and age. Draws nothing while the owner's switch
// (`risk.courierScore`) is off, or for a person without the permission. A read; nothing here moves an order or money.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { orderCourierScore } from '@extas/orders';
import { adminDeps } from '@/lib/admin-auth';
import { courierScoreCardView } from '@/lib/admin-orders/courier-score';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { readDeps } from './OrderListPage';

export async function CourierScoreCard({ order, view: given }: { order: { id: string }; view?: AdminView }) {
  const deps = adminDeps();
  const access = await pageAccess('orders.read', deps, MOTHER_STORE_ID);
  if (access.kind !== 'ok') return null;
  if (!(access.guard.permissions ?? new Set<string>()).has('orders.risk.read')) return null;
  let loaded: [AdminView, Awaited<ReturnType<typeof orderCourierScore>>];
  try {
    loaded = await Promise.all([given ?? adminView(deps), orderCourierScore(readDeps(access.deps), { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx }, order.id)]);
  } catch {
    return null;
  }
  const [view, card] = loaded;
  if (!card?.enabled || !card.result) return null;
  const v = courierScoreCardView(view, card.result);
  return (
    <section className="a2-card" data-testid="order-courier-score">
      <div className="a2-ch">
        <h2 className="a2-h3">
          {v.title}{' '}
          <span className={`a2-pill ${v.pill.tone}`} data-testid="courier-score-pill">
            {v.pill.text}
          </span>
        </h2>
      </div>
      <p className="a2-sm" data-testid="courier-score-reason">
        {v.reason}
      </p>
      <div className="a2-lines" data-testid="courier-score-rows">
        {v.rows.map((r) => (
          <div key={r.key} className="a2-rule" data-metric={r.key}>
            <span>
              {r.label}
              <span className="a2-xs a2-mute a2-blk">{r.source}</span>
            </span>
            <span className="a2-xs">
              <b>{r.value}</b> · {r.points}
            </span>
          </div>
        ))}
      </div>
      <p className="a2-xs a2-mute a2-mt6">{v.note}</p>
    </section>
  );
}
