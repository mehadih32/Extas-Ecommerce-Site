// S22 · PR 428 (Blueprint B4.5) — the "Customer" card beside a support chat: the instant scan of the person writing
// (@extas/customers chatContextOf, on the thread as `context`). How he was found, his orders in counts — delivered,
// refused at the door, returned after delivery, cancelled, each with its share —, the risk score of his latest scored
// order, the orders still on their way with their courier parcel, his latest orders, each a link to its order page, and
// "Open customer". The counts and the risk only reach a person with `customers.read` (the service leaves them out
// otherwise); an order link only for a person with `orders.read`. A server component: nothing here changes anything.
import Link from 'next/link';
import type { ChatContext, ChatOrder } from '@extas/customers';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { t, type Dict } from '@/lib/i18n';

const orderTone = (s: string) => (s === 'DELIVERED' || s === 'PARTIALLY_DELIVERED' ? 'ok' : s === 'RETURNED' || s === 'CANCELLED' ? 'bad' : s === 'HANDED_OVER' || s === 'IN_TRANSIT' ? 'info' : 'warn');

export function CustomerContext({ ctx, d, lang, locale, money, timeZone }: { ctx: ChatContext; d: Dict; lang: 'en' | 'bn'; locale: string; money: Money; timeZone: string }) {
  const c = (k: string, v?: Record<string, string>) => t(d, `sup.ctx.${k}`, v);
  const n = (x: number) => formatNumber(x, locale);
  const share = (x: number, pct: number | null) => (pct === null ? n(x) : c('share', { n: n(x), p: n(pct) }));
  const row = (o: ChatOrder, test: string) => {
    const inner = (
      <>
        <span className="a2-mono">{o.number}</span>
        <span className="a2-xs a2-mute">
          {printedAt(o.placedAt.toISOString(), timeZone)} · {formatMoney(o.totalMinor, money)}
          {o.parcel ? ` · ${o.parcel.courier} · ${t(d, `orders.ship.${o.parcel.status}`)}${o.parcel.trackingCode ? ` · ${o.parcel.trackingCode}` : ''}` : ''}
        </span>
        <span className={`a2-pill ${orderTone(o.status)}`}>{t(d, `orders.st.${o.status}`)}</span>
      </>
    );
    return (
      <li key={o.id}>
        {ctx.you.orders ? (
          <Link className="sp-same-row" href={`/admin/orders/${o.id}`} data-testid={test}>
            {inner}
          </Link>
        ) : (
          <div className="sp-same-row" data-testid={test}>
            {inner}
          </div>
        )}
      </li>
    );
  };
  const h = ctx.history;
  const r = ctx.ratios;
  const recent = ctx.recent.filter((o) => !ctx.live.some((l) => l.id === o.id));
  return (
    <section className="a2-card" aria-labelledby="sp-ctx" data-testid="support-context">
      <h2 className="a2-h4" id="sp-ctx">
        {c('h')}
      </h2>
      <p className="a2-xs a2-mute" style={{ margin: '4px 0 12px' }} data-testid="support-context-by">
        {ctx.matchedBy === 'customer' ? c('byCustomer') : ctx.matchedBy === 'phone' ? c('byPhone') : c('unknown')}
      </p>
      {ctx.matchedBy && !ctx.orders ? <p className="a2-sm a2-mute">{c('none')}</p> : null}
      {ctx.orders ? (
        <div className="sp-kv" data-testid="support-context-counts">
          <span>{c('orders')}</span>
          <span>{n(ctx.orders)}</span>
          {h && r ? (
            <>
              <span>{c('delivered')}</span>
              <span>{share(h.delivered, r.deliveredPct)}</span>
              <span>{c('refused')}</span>
              <span>{share(h.refused, r.refusedPct)}</span>
              <span>{c('returned')}</span>
              <span>{share(h.returns, r.returnedPct)}</span>
              <span>{c('cancelled')}</span>
              <span>{n(h.cancelled)}</span>
              {h.ourFault ? (
                <>
                  <span>{c('ourFault')}</span>
                  <span>{n(h.ourFault)}</span>
                </>
              ) : null}
              <span>{c('risk')}</span>
              <span data-testid="support-context-risk">
                {ctx.risk ? (
                  <>
                    <span className={`a2-pill ${ctx.risk.band?.tone ?? 'line'}`}>
                      {(ctx.risk.band ? ctx.risk.band[lang] : c('noBand')) + ` · ${n(ctx.risk.score)}`}
                    </span>{' '}
                    <span className="a2-xs a2-mute">{c('riskOf', { number: ctx.risk.number })}</span>
                  </>
                ) : (
                  c('noRisk')
                )}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      {ctx.orders && !h ? <p className="a2-xs a2-mute a2-mt6">{c('noHistory')}</p> : null}
      {ctx.orders ? (
        <>
          <h3 className="a2-lbl a2-mt12" style={{ marginBottom: 6 }}>
            {c('live')}
          </h3>
          {ctx.live.length ? <ul className="sp-same">{ctx.live.map((o) => row(o, 'support-context-live'))}</ul> : <p className="a2-sm a2-mute">{c('liveNone')}</p>}
          {recent.length ? (
            <>
              <h3 className="a2-lbl a2-mt12" style={{ marginBottom: 6 }}>
                {c('recent')}
              </h3>
              <ul className="sp-same">{recent.map((o) => row(o, 'support-context-recent'))}</ul>
            </>
          ) : null}
        </>
      ) : null}
      {ctx.customer && ctx.you.customer ? (
        <p className="a2-mt12">
          <Link className="a2-btn sm" href={`/admin/customers/${ctx.customer.id}`} data-testid="support-context-open">
            {c('open')}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
