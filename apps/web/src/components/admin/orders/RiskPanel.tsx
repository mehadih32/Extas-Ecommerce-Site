// S06 · PR 160 — the risk card on one order's admin page (/admin/orders/<id>; demo V12.3 #/admin/orders/:id "Risk"): the
// band and score as they were stored, each signal that counted with its weight and what it saw, when and why it was
// scored, the earlier scores, whether the owner's rules changed since, and the number's history now (PR 157).
// Self-contained like the support explanation: it checks `orders.risk.read` itself and draws nothing for a person
// without it, when the owner hides the card (`risk.score.showOnOrder`), or for an order never scored while the model is
// off. "Score again" (a new dated score, `orders.risk.decide`) is the only button. The score only informs. PR 161: the
// level's steps (watch, hold, call) and the advance it proposes, as a line under the heading.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { orderRisk } from '@extas/orders';
import { adminDeps } from '@/lib/admin-auth';
import { riskCardView, type RiskCardView } from '@/lib/admin-orders/risk';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { ShellIcon } from '../shell/ShellIcon';
import { CommandButton } from './OrderCommands';
import { readDeps } from './OrderListPage';

export async function RiskPanel({ order, view: given }: { order: { id: string; number: string; currency: string }; view?: AdminView }) {
  const deps = adminDeps();
  const access = await pageAccess('orders.read', deps, MOTHER_STORE_ID);
  if (access.kind !== 'ok') return null;
  const perms = access.guard.permissions ?? new Set<string>();
  if (!perms.has('orders.risk.read')) return null;
  let v: RiskCardView | null = null;
  try {
    const [view, panel] = await Promise.all([given ?? adminView(deps), orderRisk(readDeps(access.deps), { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx }, order.id)]);
    v = panel ? riskCardView(view, panel, order, perms) : null;
  } catch {
    // a reading aid: if it cannot be read, the order page still shows everything else
    v = null;
  }
  if (!v) return null;
  return (
    <section className="a2-card" data-testid="order-risk">
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">
            {v.title}{' '}
            {v.pill ? (
              <span className={`a2-pill ${v.pill.tone}`} data-testid="risk-pill">
                {v.pill.text}
              </span>
            ) : null}
          </h2>
          <div className="a2-cs">{v.when ?? v.sub}</div>
        </div>
        {v.rescore ? <CommandButton spec={v.rescore} size="sm" /> : null}
      </div>
      {v.level ? (
        <div className="a2-note" data-testid="risk-level">
          <ShellIcon name="flag" size={15} />
          <span>
            <b>{v.level.line}</b>
            {v.level.ask ? (
              <span className="a2-blk" data-testid="risk-level-ask">
                {v.level.ask}
                <span className="a2-xs a2-mute a2-blk">{v.level.askNote}</span>
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      {v.rows.length ? (
        <div className="a2-lines" data-testid="risk-signals">
          {v.rows.map((r) => (
            <div key={r.key} className="a2-rule" data-signal={r.key}>
              <span>
                {r.label}
                <span className="a2-xs a2-mute a2-blk">{r.detail}</span>
              </span>
              <span className="a2-pill warn">{r.weight}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="a2-sm a2-mute" data-testid="risk-empty">
          {v.empty}
        </div>
      )}
      {v.rulesChanged ? (
        <div className="a2-note" data-testid="risk-rules-changed">
          <ShellIcon name="info" size={15} />
          <span>{v.rulesChanged}</span>
        </div>
      ) : null}
      <div className="a2-kv2 a2-mt12" data-testid="risk-history">
        <span>{v.history.label}</span>
        <span>{v.history.line}</span>
      </div>
      {v.earlier ? (
        <div className="a2-mt12" data-testid="risk-earlier">
          <div className="a2-xs a2-mute a2-b">{v.earlier.title}</div>
          {v.earlier.rows.map((r, i) => (
            <div key={i} className="a2-sm">
              {r}
            </div>
          ))}
        </div>
      ) : null}
      <div className="a2-note">
        <ShellIcon name="shield" size={15} />
        <span>{v.informs}</span>
      </div>
    </section>
  );
}
