// PR 610 (CN-028, ERP contract v6) — the ERP part of one order's admin page (/admin/orders/<id>): whether the ERP
// has the order or why it waits, the account's hold band, the ERP total and billing (for those who may read the ERP
// account), each piece with "From ERP return stock", a short line's decision (WAIT, REPLACE, CANCEL; `orders.lines`),
// and the ERP's identification colour. Self-contained like the support panel: it checks `orders.read` itself and draws nothing in v5, when the order never went to the ERP, or when
// it cannot be read (the rest of the order page still shows). Guide: docs/admin-guide/orders.md "ERP order".
import { MOTHER_STORE_ID } from '@extas/db/client';
import { erpOrderView, type InventoryDeps } from '@extas/inventory';
import { adminDeps } from '@/lib/admin-auth';
import { decideTexts, erpPanelView, type ErpPanelView } from '@/lib/admin-orders/erp';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { ErpLineDecision } from './ErpOrderActions';

/** The page never calls the ERP from here: the views read the shop's own rows only. */
const NO_ERP = { use: () => Promise.reject(new Error('the order page reads the ERP rows only')) } as unknown as InventoryDeps['connections'];

export async function ErpOrderPanel({ orderId, currency, view: given }: { orderId: string; currency: string; view?: AdminView }) {
  const deps = adminDeps();
  const access = await pageAccess('orders.read', deps, MOTHER_STORE_ID);
  if (access.kind !== 'ok') return null;
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const base = { db: access.deps.db, settings: access.deps.resolver, now: access.deps.now };
  let view: AdminView;
  let v: ErpPanelView | null = null;
  try {
    view = given ?? (await adminView(deps));
    const erp = await erpOrderView({ ...base, connections: NO_ERP }, who, orderId);
    v = erpPanelView(view, orderId, currency, erp);
  } catch {
    v = null;
  }
  if (!v) return null;
  const d = view!.dict;
  const decide = decideTexts(view!);
  return (
    <section className="a2-card" data-testid="order-erp">
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{v.title}</h2>
          <div className="a2-cs">{v.sub}</div>
        </div>
        <span className={`a2-pill ${v.chip.tone}`} data-testid="erp-state">
          {v.chip.text}
        </span>
      </div>
      {v.band ? (
        <div className={`a2-band ${v.band.tone === 'bad' ? 'bad' : 'stale'}`} data-testid="erp-hold">
          <ShellIcon name="alert" size={16} />
          <span>{v.band.text}</span>
        </div>
      ) : null}
      {v.held ? (
        <div className="a2-note" data-testid="erp-held">
          <ShellIcon name="clock" size={15} />
          <span>{v.held}</span>
        </div>
      ) : null}
      <div className="a2-kv2">
        {v.rows.map((r) => (
          <span key={r.label} style={{ display: 'contents' }}>
            <span>{r.label}</span>
            <span className={r.mono ? 'a2-mono' : undefined}>{r.value}</span>
          </span>
        ))}
        {v.identification ? (
          <>
            <span>{t(d, 'erpOrder.row.identification')}</span>
            <span>
              <span className={`a2-pill ${v.identification.tone}`} data-testid="erp-ident" data-code={v.identification.code}>
                {v.identification.text}
              </span>
            </span>
          </>
        ) : null}
      </div>
      <h3 className="a2-h4 a2-mt12">{v.linesTitle}</h3>
      <div className="a2-lines" data-testid="erp-lines">
        {v.lines.map((l) => (
          <div key={l.lineId} data-line={l.lineId}>
            <div className="a2-prow">
              <div className="a2-prt">
                <b className="a2-mono">{l.sku}</b>
                <span>
                  {l.lineId}
                  {l.shop ? ` · ${t(d, 'erpOrder.lines.shop')} ${l.shop}` : ''}
                </span>
              </div>
              <span className="a2-gap8">
                {l.fromReturn ? (
                  <span className="a2-pill info" title={v.fromReturnHelp} data-testid={`erp-fromreturn-${l.lineId}`}>
                    {t(d, 'erpOrder.lines.fromReturn')}
                  </span>
                ) : null}
                <span className={`a2-pill ${l.state.tone}`}>{l.state.text}</span>
              </span>
              <span className="a2-prs">{l.price}</span>
            </div>
            {l.short ? <div className="a2-xs a2-mute">{l.short}</div> : null}
            {l.decided ? <div className="a2-xs a2-mute">{l.decided}</div> : null}
            {l.decide ? <ErpLineDecision url={v.decideUrl(l.lineId)} texts={decide} lineId={l.lineId} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
