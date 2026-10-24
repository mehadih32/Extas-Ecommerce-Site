// PR 566 — the support explanation panel on one order's admin page (/admin/orders/<id>): "Why this advance and this
// delivery charge". The headline says the advance and the charge; one click ("Why, and what to say") opens the reasons
// read from the order's own records (@extas/orders orderExplainFacts), the team-only ones marked, and the words for the
// customer in Bengali and English with Copy, for the phone or a chat. Self-contained: it checks `orders.read` and reads
// `orders.explain` itself (React's request cache makes the session check free), and draws nothing when the setting is
// off, the person may not read orders, or the order is not there. Read only: it changes nothing.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { explainOf, orderExplainFacts } from '@extas/orders';
import { adminDeps } from '@/lib/admin-auth';
import { explainView, type ExplainView } from '@/lib/admin-orders/explain';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { ShellIcon } from '../shell/ShellIcon';
import { readDeps } from './OrderListPage';
import { SupportExplainCopy } from './SupportExplainCopy';

const TONE = { ok: 'ok', warn: 'warn', info: 'info' } as const;

export async function SupportExplain({ orderId, view: given }: { orderId: string; view?: AdminView }) {
  const deps = adminDeps();
  const access = await pageAccess('orders.read', deps, MOTHER_STORE_ID);
  if (access.kind !== 'ok') return null;
  const od = readDeps(access.deps);
  const who = {
    actor: access.guard.actor,
    storeId: MOTHER_STORE_ID,
    ctx: access.guard.ctx,
  };
  let v: ExplainView | null = null;
  try {
    const [view, s, facts] = await Promise.all([given ?? adminView(deps), od.settings.value('orders.explain', { storeId: MOTHER_STORE_ID }), orderExplainFacts(od, who, orderId)]);
    if (s.enabled && facts)
      v = explainView(view, s, {
        en: explainOf(facts, 'en'),
        bn: explainOf(facts, 'bn'),
      });
  } catch {
    // a reading aid: if it cannot be read, the order page still shows everything else
    v = null;
  }
  if (!v) return null;
  const rows = (title: string, list: ExplainView['whyAdvance']['rows'], id: string) => (
    <div className="a2-mt12" data-testid={`explain-${id}`}>
      <h3 className="a2-h4">{title}</h3>
      <ul className="a2-lines" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {list.map((r, i) => (
          <li key={`${r.code}-${i}`} className="a2-sm" data-code={r.code} style={{ padding: '4px 0' }}>
            {r.text}
            {r.teamOnly ? (
              <span className="a2-pill info" style={{ marginInlineStart: 6 }}>
                {v.teamOnly}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section className="a2-card" data-testid="order-explain">
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{v.title}</h2>
          <div className="a2-cs">{v.sub}</div>
        </div>
      </div>
      <div className="a2-kv2">
        <span>{v.advance.label}</span>
        <span>
          <span className={`a2-pill ${TONE[v.advance.tone]}`} data-testid="explain-advance-kind">
            {v.advance.value}
          </span>
        </span>
        <span>{v.charge.label}</span>
        <span data-testid="explain-charge-value">
          <b>{v.charge.value}</b>
        </span>
      </div>
      <details className="a2-mt12" data-testid="explain-more">
        <summary className="a2-btn sm" style={{ listStyle: 'none', width: 'fit-content' }}>
          <ShellIcon name="info" size={15} />
          {v.more}
        </summary>
        {rows(v.whyAdvance.title, v.whyAdvance.rows, 'advance')}
        {rows(v.whyCharge.title, v.whyCharge.rows, 'charge')}
        <div className="a2-mt12" data-testid="explain-say">
          <h3 className="a2-h4">{v.say.title}</h3>
          {v.say.lines.length ? (
            v.say.lines.map((l) => (
              <div key={l.lang} className="a2-rule" lang={l.lang}>
                <span>
                  <span className="a2-xs a2-mute a2-blk">{l.label}</span>
                  <span className="a2-sm">{l.text}</span>
                </span>
                <SupportExplainCopy text={l.text} label={v.copy} done={v.copied} testId={`explain-copy-${l.lang}`} />
              </div>
            ))
          ) : (
            <div className="a2-sm a2-mute">{v.say.empty}</div>
          )}
        </div>
      </details>
    </section>
  );
}
