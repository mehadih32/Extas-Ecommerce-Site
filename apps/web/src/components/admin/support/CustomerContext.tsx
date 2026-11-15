// S22 · PR 428 (Blueprint B4.5) — the "Customer" card beside a support chat: the instant scan of the person writing
// (@extas/customers chatContextOf, on the thread as `context`). How he was found, his orders in counts — delivered,
// refused at the door, returned after delivery, cancelled, each with its share —, the risk score of his latest scored
// order, the orders still on their way with their courier parcel, his latest orders, each a link to its order page, and
// "Open customer". The counts and the risk only reach a person with `customers.read` (the service leaves them out
// otherwise); an order link only for a person with `orders.read`. Follow-up 506: his exchanges asked for and the team's
// notes (pinned first), with `customers.read` only. A server component: nothing here changes anything.
import Link from 'next/link';
import type { ChatContext, ChatOrder } from '@extas/customers';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { t, type Dict } from '@/lib/i18n';

const orderTone = (s: string) => (s === 'DELIVERED' || s === 'PARTIALLY_DELIVERED' ? 'ok' : s === 'RETURNED' || s === 'CANCELLED' ? 'bad' : s === 'HANDED_OVER' || s === 'IN_TRANSIT' ? 'info' : 'warn');

/** Refused parcels from which the panel says "ask for the delivery charge first" (the prototype's own two; a hint line only). */
const REFUSED_NOTE_AT = 2; // hardcode-ok: the prototype's hint point; it changes a sentence, never an order

/** parity F4 · PR 850: what to do before the order goes out, from the risk band (green / yellow / red) of the person's latest scored order. */
export function adviceKey(tone: 'ok' | 'warn' | 'bad' | undefined): 'auto' | 'call' | 'charge' | null {
  return tone === 'ok' ? 'auto' : tone === 'warn' ? 'call' : tone === 'bad' ? 'charge' : null;
}

export function CustomerContext({ ctx, d, lang, locale, money, timeZone, chatPhone = null }: { ctx: ChatContext; d: Dict; lang: 'en' | 'bn'; locale: string; money: Money; timeZone: string; chatPhone?: string | null }) {
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
      {ctx.matchedBy === 'phone' && chatPhone ? (
        <div className="sp-found" data-testid="support-phone-found">
          <b>{c('phoneFound')}</b> <span className="a2-mono">{chatPhone}</span>
          <div className="a2-xs">
            {ctx.customer
              ? c('phoneMatches', { name: ctx.customer.name ?? c('unknown'), orders: n(ctx.orders), refused: ctx.history ? n(ctx.history.refused) : '—' })
              : c('phoneNew')}
          </div>
          <a className="a2-lnk a2-xs" href="#sp-person">
            {c(ctx.customer ? 'phoneLink' : 'phoneSave')}
          </a>
        </div>
      ) : null}
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
              {ctx.exchanges !== null ? (
                <>
                  <span>{c('exchanges')}</span>
                  <span data-testid="support-context-exchanges">{n(ctx.exchanges)}</span>
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
      {ctx.notes.length ? (
        <>
          <h3 className="a2-lbl a2-mt12" style={{ marginBottom: 6 }}>
            {c('notes')}
          </h3>
          <ul className="sp-same" data-testid="support-context-notes">
            {ctx.notes.map((x, i) => (
              <li key={i} className="sp-same-row">
                {x.pinned ? <span className="a2-pill line">{c('pinned')}</span> : null}
                <span>{x.body}</span>
                <span className="a2-xs a2-mute">{printedAt(x.at.toISOString(), timeZone)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {ctx.risk && adviceKey(ctx.risk.band?.tone) ? (
        <div className="sp-advice" data-testid="support-advice" data-tone={ctx.risk.band?.tone}>
          <span className="a2-xs a2-mute">{c('riskBand')}</span>
          <b>{ctx.risk.band ? ctx.risk.band[lang] : c('noBand')}</b>
          <span className="a2-xs">{c(`advice.${adviceKey(ctx.risk.band?.tone)}`)}</span>
        </div>
      ) : null}
      {h && h.refused >= REFUSED_NOTE_AT ? (
        <p className="a2-note warn a2-mt12" data-testid="support-refused-note">
          {c('refusedNote')}
        </p>
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
