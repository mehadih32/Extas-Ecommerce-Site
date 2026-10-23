// PR 134 — one order's page in My account (demo 60-account.js PAGES.order, ord_line, ord_side, V12.2): the order
// number with when it was placed and its stored state, where it is going, every line with its picture, colour, size and
// quantity (an add-on and a set's piece marked as such), and on the side the money as stored — subtotal, offers, wallet,
// delivery, total — with how it is paid, and help on WhatsApp with the order number. Read for the signed-in customer
// whose order it is, or for the browser that placed it; anyone else is asked to log in (no word on whose order it is).
// Left out until their PRs: ~~the invoice (PR 136)~~, reviews, size exchange and order edits (S06/S05), the demo-only
// controls. ~~The tracking steps and the welcome panel come with PR 135.~~
// PR 135: the tracking steps with their times and the band's promise, the late flag past that promise (SIM-F-018), the
// courier and its tracking code once booked, the welcome panel when he comes from the thank-you page (his account and
// how he logs in: a code by SMS, never a password), and the exact amount for the rider (CN-014 idea 10, off by default).
// PR 136 (follow-up 147): under the items, the invoice row — "Invoice INV-…", every item ready to print or keep, and
// "Get invoice", which opens the order's invoice page (demo ord-invrow).
import '../bag/bag.css';
import './account.css';
import type { ReactNode } from 'react';
import type { Receipt } from '@extas/checkout';
import { lateOf, riderAmountOf, trackOf, type LateRule, type OrderState } from '@extas/accounts/pure';
import { cardsByIds, colourName } from '@/lib/shop/catalogue';
import { checkoutWords } from '@/lib/shop/checkout';
import { hoursOf } from '@/lib/shop/checkout-model';
import type { ShopContext } from '@/lib/shop/context';
import { dateText } from '@/lib/shop/account-view';
import { fill } from '@/lib/shop/dict';
import { plural } from '@/lib/shop/bag-model';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon, WaGlyph } from '../Icon';
import { nameOf, Thumb } from '../bag/BagLines';
import { AccountCrumbs } from './AccountShell';
import { LateTag, StatusTag } from './AccountTabs';
import { OrderTrack } from './OrderTrack';
import { OrderWelcome } from './OrderWelcome';

/** PR 135 — what the owner switched on for the tracking page (`account.track.*`). */
export interface TrackOptions {
  welcome: boolean;
  late: LateRule;
  exact: { enabled: boolean; report: boolean };
}

/** Signed out, or not his order: log in (with the number of that order), then come back here. */
export function OrderPrompt({ c, number, signedIn }: { c: ShopContext; number: string; signedIn: boolean }) {
  const t = c.t;
  const here = hrefIn(c.lang, ROUTES.order(number));
  return (
    <div className="container acc-page" data-testid="order-prompt">
      <AccountCrumbs c={c} trail={[[t('account.title'), hrefIn(c.lang, ROUTES.account)], [t('account.order.crumb', { number }), null]]} />
      <section className="card acc-prompt mt16">
        <span className="acc-prompt-i">
          <Icon name="lock" size={24} />
        </span>
        <h1 className="h2">{t(signedIn ? 'account.order.notYours' : 'account.order.promptTitle')}</h1>
        <p className="text2 small">{signedIn ? t('account.order.notYoursText', { number }) : t('account.order.promptText')}</p>
        <a className="btn btn-primary" href={`${hrefIn(c.lang, ROUTES.login)}?next=${encodeURIComponent(here)}`} data-testid="order-prompt-login">
          <Icon name="user" size={17} />
          {t('account.prompt.button')}
        </a>
      </section>
    </div>
  );
}

export async function OrderPage({
  c,
  r,
  waOn,
  opts,
  fromThanks = false,
  invoiceNo = null,
}: {
  c: ShopContext;
  r: Receipt;
  waOn: boolean;
  opts: TrackOptions;
  fromThanks?: boolean;
  /** PR 136: the order's invoice number, or null while the owner has invoices off. */
  invoiceNo?: string | null;
}) {
  const t = c.t;
  const words = checkoutWords(c);
  const w = (k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);
  const m = c.money;
  const status = r.status as OrderState;
  const view = { status, track: trackOf(status, { placedAt: r.placedAt, ...r.times }) };
  const late = lateOf({ status, placedAt: r.placedAt, hoursMax: r.addressUnclear ? null : r.band?.hoursMax }, opts.late, new Date());
  const hours = r.band && !r.addressUnclear ? hoursOf(r.band, c.num) : null;
  const units = r.lines.reduce((s, l) => s + l.quantity, 0);
  const cards = await cardsByIds(c.storeId, r.lines.map((l) => l.productId).filter((x): x is string => !!x));
  const wa = waOn ? waHref(c.s['contact.whatsapp'], t('account.order.helpMsg', { ...c.vars, number: r.number })) : null;
  const pay = r.pay;
  const waNumber = waOn ? c.s['contact.whatsapp'] : null;
  const lateWa = late.late ? waHref(waNumber, t('account.track.lateMsg', { ...c.vars, number: r.number })) : null;
  // the exact amount for the rider: only while it is still on its way (not delivered, cancelled or returned)
  const rider = opts.exact.enabled && !view.track.done && !view.track.ended ? riderAmountOf(pay) : null;
  const riderWa = rider !== null && opts.exact.report ? waHref(c.s['contact.whatsapp'], t('account.track.exactMsg', { ...c.vars, number: r.number, amount: m(rider) })) : null;
  const welcome = fromThanks && opts.welcome && (r.account === 'created' || r.account === 'existing');
  const methodName = (p: { method: string | null; provider: string | null }) =>
    p.method === 'ONLINE' || p.provider === 'online' ? w('pay.online') : p.provider && words[`pm.${p.provider}`] ? w(`pm.${p.provider}`) : (p.provider ?? p.method ?? '');
  const row = (k: string, v: ReactNode, cls = '', testId?: string) => (
    <div className={`ord-sum-row${cls ? ` ${cls}` : ''}`} data-testid={testId}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
  const payLine =
    pay.kind === 'cod' ? (
      <>
        <div className="row between">
          <span className="small">{t('account.order.payment')}</span>
          <span className="small bold">{w('pay.cod')}</span>
        </div>
        <div className="xs muted" style={{ marginTop: 2 }}>
          {view.track.done ? t('account.order.codDone') : t('account.order.codDue', { amount: m(pay.dueMinor) })}
        </div>
      </>
    ) : pay.kind === 'paid' ? (
      <div className="row between">
        <span className="small">{t('account.order.payment')}</span>
        <span className="small bold">
          {t('account.order.paid')}
          {pay.method === 'WALLET' || pay.paidMinor === 0 ? '' : ` · ${methodName(pay)}`}
        </span>
      </div>
    ) : (
      <>
        <div className="row between">
          <span className="small">{t('account.order.payment')}</span>
          <span className="small bold">{methodName(pay)}</span>
        </div>
        <div className="xs muted" style={{ marginTop: 2 }}>
          {t('account.order.due', { amount: m(pay.dueMinor) })}
        </div>
        <a className="btn btn-primary btn-block mt12" href={hrefIn(c.lang, ROUTES.checkoutPay(r.number))} data-testid="order-pay-now">
          <Icon name="lock" size={17} />
          {t('account.order.payNow')}
        </a>
      </>
    );

  return (
    <div className="container acc-page ord-page" data-testid="order-page" data-number={r.number} data-status={r.status}>
      <AccountCrumbs c={c} trail={[[t('account.title'), hrefIn(c.lang, ROUTES.account)], [t('account.order.crumb', { number: r.number }), null]]} />
      <div className="split-side mt16">
        <div className="ord-main">
          {welcome ? (
            <OrderWelcome
              phone={r.phone}
              words={{
                title: t('account.track.welcomeTitle'),
                text: t(r.account === 'created' ? 'account.track.welcomeCreated' : 'account.track.welcomeExisting'),
                loginWith: t('account.track.loginWith'),
                how: t('account.track.how'),
                howText: t('account.track.howText'),
                close: t('account.track.close'),
              }}
            />
          ) : null}
          <section className="card ord-hd" aria-labelledby="ord-h">
            <div className="row between wrap top" style={{ gap: 12 }}>
              <div>
                <div className="eyebrow">{t('account.order.eyebrow')}</div>
                <h1 className="h1" id="ord-h" style={{ marginTop: 4 }}>
                  #{r.number}
                </h1>
                <div className="small text2" style={{ marginTop: 2 }}>
                  {t('account.orders.placed', { date: dateText(c, r.placedAt, true) })} · {plural(t, 'account.orders.items', units, c.num)}
                </div>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <StatusTag c={c} o={view} />
                {late.late ? <LateTag c={c} /> : null}
              </div>
            </div>
            <OrderTrack c={c} track={view.track} late={late} hours={hours} lateWa={lateWa} />
            <div className="ord-meta">
              {r.shipment ? (
                <>
                  <div data-testid="order-courier">
                    <div className="xs muted">{t('account.track.courier')}</div>
                    <div className="small bold">{r.shipment.courier}</div>
                  </div>
                  {r.shipment.tracking ? (
                    <div>
                      <div className="xs muted">{t('account.track.tracking')}</div>
                      <div className="small bold">{r.shipment.tracking}</div>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="wide">
                <div className="xs muted">{t('account.order.deliveringTo')}</div>
                <div className="small">
                  <b>{r.name}</b>
                  {r.phone ? ` · ${r.phone}` : ''}
                </div>
                <div className="small text2">{r.address}</div>
              </div>
            </div>
          </section>
          <section className="card" aria-labelledby="oi-h" data-testid="order-items">
            <div className="ord-cardhd">
              <h2 className="h3" id="oi-h">
                {t('account.order.items')}
              </h2>
              <span className="xs muted">{plural(t, 'account.orders.items', units, c.num)}</span>
            </div>
            {r.lines.map((l) => {
              const name = nameOf(l, c);
              return (
                <div className="ord-line" key={l.id} data-testid="order-line">
                  <div className="ord-thumb">
                    <Thumb c={c} card={l.productId ? cards.get(l.productId) : undefined} colourKey={l.colour?.key || undefined} hex={l.colour?.hex ?? ''} alt={name} />
                  </div>
                  <div className="grow">
                    <div className="row between top" style={{ gap: 10 }}>
                      <span className="ord-name">{name}</span>
                      <span className="price">{m(l.amountMinor)}</span>
                    </div>
                    <div className="small text2" style={{ marginTop: 2 }}>
                      {[l.colour ? colourName(l.colour, c.lang) : null, l.size, l.quantity > 1 ? t('account.order.qty', { n: c.num(l.quantity) }) : null].filter(Boolean).join(' · ')}
                    </div>
                    {l.isAddOn || l.setKey ? (
                      <div className="row wrap mt8" style={{ gap: 6 }}>
                        {l.isAddOn ? (
                          <span className="tag" data-testid="order-addon">
                            <Icon name="plus" size={12} />
                            {t('account.order.addOn')}
                          </span>
                        ) : null}
                        {l.setKey ? (
                          <span className="tag plain" data-testid="order-set">
                            <Icon name="layers" size={12} />
                            {t('account.order.set')}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {invoiceNo ? (
              <div className="ord-invrow" data-testid="order-invoice">
                <div>
                  <b className="small">{t('account.invoice.rowTitle', { invoice: invoiceNo })}</b>
                  <div className="xs muted">{t('account.invoice.rowText', { items: plural(t, 'account.orders.items', units, c.num) })}</div>
                </div>
                <a className="btn btn-secondary shrink0" href={hrefIn(c.lang, ROUTES.invoice(r.number))} data-testid="order-invoice-get">
                  <Icon name="doc" size={16} />
                  {t('account.invoice.get')}
                </a>
              </div>
            ) : null}
          </section>
          <a className="btn btn-ghost acc-start" href={hrefIn(c.lang, ROUTES.orders)}>
            <Icon name="back" size={16} />
            {t('account.order.back')}
          </a>
        </div>
        <aside className="stack s16 sticky-d" aria-label={t('account.order.summary')}>
          <section className="card p20" aria-labelledby="op-h" data-testid="order-summary">
            <h2 className="h3" id="op-h">
              {t('account.order.summary')}
            </h2>
            <div className="mt12">
              {row(t('account.order.subtotal'), m(r.subtotalMinor))}
              {r.discountMinor > 0 ? row(t('account.order.discount'), <span className="brandc">−{m(r.discountMinor)}</span>) : null}
              {r.walletMinor > 0 ? row(t('account.order.wallet'), <span className="brandc">−{m(r.walletMinor)}</span>) : null}
              {row(
                t('account.order.delivery'),
                !r.chargeFixed ? (
                  <span className="muted">{t('account.order.onCall')}</span>
                ) : r.deliveryMinor === 0 ? (
                  <span className="bg-freeb">
                    <Icon name="check" size={13} />
                    {t('account.order.free')}
                  </span>
                ) : (
                  m(r.deliveryMinor)
                ),
              )}
              {row(t('account.order.total'), <span className="price">{m(r.totalMinor)}</span>, 'total', 'order-total')}
            </div>
            <div className="soft ord-pay mt12" data-testid="order-pay" data-pay={pay.kind}>
              {payLine}
            </div>
            {rider !== null ? (
              <div className="ord-exact mt12" data-testid="order-exact" data-amount={rider}>
                <span className="brandc">
                  <Icon name="cash" size={18} />
                </span>
                <div>
                  <div className="small bold">{rider > 0 ? t('account.track.exact', { amount: m(rider) }) : t('account.track.exactPaid')}</div>
                  {riderWa ? (
                    <a className="link xs bold" href={riderWa} target="_blank" rel="noopener noreferrer" data-testid="order-exact-report">
                      {t('account.track.exactReport')}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
          {wa ? (
            <section className="card p20" aria-labelledby="oh-h">
              <h2 className="h3" id="oh-h">
                {t('account.order.help')}
              </h2>
              <a className="btn btn-secondary btn-block mt12 acc-sidewa" href={wa} target="_blank" rel="noopener noreferrer">
                <WaGlyph size={18} />
                {t('account.order.helpWa')}
              </a>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
