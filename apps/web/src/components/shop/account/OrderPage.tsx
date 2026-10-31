// PR 134 — one order's page in My account (demo 60-account.js PAGES.order, ord_line, ord_side, V12.2): the order
// number with when it was placed and its stored state, where it is going, every line with its picture, colour, size and
// quantity (an add-on and a set's piece marked as such), and on the side the money as stored — subtotal, offers, wallet,
// delivery, total — with how it is paid, and help on WhatsApp with the order number. Read for the signed-in customer
// whose order it is, or for the browser that placed it; anyone else is asked to log in (no word on whose order it is).
// Left out until their PRs: ~~the invoice (PR 136)~~, reviews, ~~size exchange~~ (PR 186) and order edits (S06/S05), the demo-only
// controls. ~~The tracking steps and the welcome panel come with PR 135.~~
// PR 184: the courier's news under the steps when the owner turns it on (out for delivery, a failed try, the address,
// "we are checking with the courier").
// PR 135: the tracking steps with their times and the band's promise, the late flag past that promise (SIM-F-018), the
// courier and its tracking code once booked, the welcome panel when he comes from the thank-you page (his account and
// how he logs in: a code by SMS, never a password), and the exact amount for the rider (CN-014 idea 10, off by default).
// PR 136 (follow-up 147): under the items, the invoice row — "Invoice INV-…", every item ready to print or keep, and
// "Get invoice", which opens the order's invoice page (demo ord-invrow).
// PR 65: "Rate & review" under each line of a delivered order, for the signed-in customer whose order it is. His
// review is saved waiting for the shop's check, and the line then says so ("Review waiting for approval"); nothing of
// it is shown to anyone before a member of staff approves it (SIM-F-008).
// Follow-up 261 (PR 146): the two-size question under the order's head, while one is open (`orders.twoSize`, off).
// Follow-up 260 (PR 143): "Change address, phone or size" under the items (demo ord_editCard), while the owner lets
// customers edit (`orders.edit.customer`, off): open with "Edit order (n left)", or closed with the reason.
// S05 · PR 150: "What happened" under it, folded shut — the order's life as he may see it (`account.history.timeline`).
// Gate F-041 (PR 172 follow-up): beside the payment summary, his refunds on this order — the amount, the way it goes
// back (as he paid, or his wallet) and where it stands (being checked, approved and on its way, sent with the day, or
// not approved), only when there is one.
// S08 · PR 186: "Exchange size" / "Report a problem" under each piece he may still exchange, and his exchanges on the
// order (demo 60-account.js ord_line, ord_exchanges), while the owner has the account's exchange on.
// Review R3 (M3): the delivered step says what the checkout said ("ships from …" for an order placed in the holiday
// break, "may arrive after Eid") instead of the hours, and the late flag counts on the courier's own promise clock
// (from the first day back; never late after Eid).
import '../bag/bag.css';
import './account.css';
import './exchange.css';
import type { ReactNode } from 'react';
import type { Receipt } from '@extas/checkout';
import type { OrderReviewBox } from '@/lib/shop/account-review';
import type { OrderExtras } from '@/lib/shop/account-order';
import { phoneNormalizeBD } from '@/lib/phone-bd';
import { courierNewsOf, lateOf, riderAmountOf, trackOf, type LateRule, type OrderState } from '@extas/accounts/pure';
import { cardsByIds, colourName } from '@/lib/shop/catalogue';
import { checkoutWords } from '@/lib/shop/checkout';
import { canProblem, canSize } from '@/lib/shop/exchange-model';
import { hoursOf } from '@/lib/shop/checkout-model';
import type { ShopContext } from '@/lib/shop/context';
import { dateText } from '@/lib/shop/account-view';
import { fill, keysOf, SHOP_DICTS } from '@/lib/shop/dict';
import { listText, plural } from '@/lib/shop/bag-model';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon, WaGlyph } from '../Icon';
import { nameOf, Thumb } from '../bag/BagLines';
import { AccountCrumbs } from './AccountShell';
import { LateTag, StatusTag } from './AccountTabs';
import { OrderEditCard } from './OrderEditCard';
import { OrderLife } from './OrderLife';
import { OrderTrack } from './OrderTrack';
import { ReviewForm, ReviewState, type ReviewWords } from './ReviewForm';
import { OrderWelcome } from './OrderWelcome';
import { TwoSizeCard } from './TwoSizeCard';

/** PR 65 — the words the client review form needs, from the shop dictionary (`account.review.*`). */
const REVIEW_KEYS = [
  'cta',
  'title',
  'line',
  'rating',
  'ratingN',
  'fitAsk',
  'fit.small',
  'fit.right',
  'fit.big',
  'height',
  'feet',
  'inches',
  'weight',
  'photo',
  'photoReward',
  'body',
  'submit',
  'sending',
  'sent',
  'close',
  'state.pending',
  'state.published',
  'state.hidden',
  'err.rating',
  'err.signedOut',
  'err.off',
  'err.notDelivered',
  'err.late',
  'err.exists',
  'err.photo',
  'err.big',
  'err.offline',
] as const;

/** PR 135 — what the owner switched on for the tracking page (`account.track.*`). */
export interface TrackOptions {
  welcome: boolean;
  late: LateRule;
  exact: { enabled: boolean; report: boolean };
  /** PR 184: the courier's news line (`account.track.courier`, off by default). */
  courier: { enabled: boolean; exceptions: boolean };
}

/** The words under `prefix` with the prefix taken off ("account.edit.title" → "title"), slots left for the client. */
function prefixed(c: ShopContext, prefix: string): Record<string, string> {
  return Object.fromEntries(
    keysOf(SHOP_DICTS[c.lang])
      .filter((k) => k.startsWith(prefix))
      .map((k) => [k.slice(prefix.length), c.t(k, c.vars)]),
  );
}

/** Follow-up 260 — the edit card's words, with the phone box's errors and "something went wrong" from `account.err`. */
function editWordsOf(c: ShopContext): Record<string, string> {
  return { ...prefixed(c, 'account.edit.'), 'err.phoneEmpty': c.t('account.err.phoneEmpty'), 'err.phoneBad': c.t('account.err.phoneBad'), 'err.offline': c.t('account.err.offline') };
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
  review = null,
  extras = null,
  eta = [],
  promise = null,
}: {
  c: ShopContext;
  r: Receipt;
  waOn: boolean;
  opts: TrackOptions;
  fromThanks?: boolean;
  /** PR 136: the order's invoice number, or null while the owner has invoices off. */
  invoiceNo?: string | null;
  /** PR 65: the review box of this order (null: not his account, reviews off, or nothing to review). */
  review?: OrderReviewBox | null;
  /** Follow-ups 260, 261 and PR 150: the edit card, the two-size question and "What happened" (null: none of them). */
  extras?: OrderExtras | null;
  /** Review R3 (M3): the checkout's delivery line for this order (empty: the usual hours promise). */
  eta?: string[];
  /** Review R3 (M3): the promise the late flag counts against (null: the band's hours from the placing). */
  promise?: { from: string; hoursMax: number | null; afterEid: boolean } | null;
}) {
  const t = c.t;
  const words = checkoutWords(c);
  const w = (k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);
  const m = c.money;
  const status = r.status as OrderState;
  const view = { status, track: trackOf(status, { placedAt: r.placedAt, ...r.times }) };
  const clock = promise ? { placedAt: promise.from, hoursMax: promise.hoursMax } : { placedAt: r.placedAt, hoursMax: r.band?.hoursMax };
  const late = lateOf({ status, placedAt: clock.placedAt, hoursMax: r.addressUnclear ? null : clock.hoursMax }, opts.late, new Date());
  const hours = r.band && !r.addressUnclear ? hoursOf(r.band, c.num) : null;
  const etaLine = eta.length && !r.addressUnclear ? eta.join(' ') : null;
  const news = courierNewsOf(r.shipment, status, opts.courier);
  const units = r.lines.reduce((s, l) => s + l.quantity, 0);
  // PR 186: the new pieces of his exchanges are drawn too
  const newIds = (extras?.exchange?.exchanges ?? []).flatMap((x) => x.items.flatMap((i) => (i.newProductId ? [i.newProductId] : [])));
  const cards = await cardsByIds(c.storeId, [...r.lines.map((l) => l.productId).filter((x): x is string => !!x), ...newIds]);
  const wa = waOn ? waHref(c.s['contact.whatsapp'], t('account.order.helpMsg', { ...c.vars, number: r.number })) : null;
  const pay = r.pay;
  const waNumber = waOn ? c.s['contact.whatsapp'] : null;
  const lateWa = late.late ? waHref(waNumber, t('account.track.lateMsg', { ...c.vars, number: r.number })) : null;
  // the exact amount for the rider: only while it is still on its way (not delivered, cancelled or returned)
  const rider = opts.exact.enabled && !view.track.done && !view.track.ended ? riderAmountOf(pay) : null;
  const riderWa = rider !== null && opts.exact.report ? waHref(c.s['contact.whatsapp'], t('account.track.exactMsg', { ...c.vars, number: r.number, amount: m(rider) })) : null;
  const welcome = fromThanks && opts.welcome && (r.account === 'created' || r.account === 'existing');
  // PR 65: the review words, flattened once for the client form (every one of them the owner's to change)
  const reviewWords: ReviewWords = review ? Object.fromEntries(REVIEW_KEYS.map((k) => [k, t(`account.review.${k}`)])) : {};
  const rewardText = review?.rewardMinor ? m(review.rewardMinor) : null;
  // follow-up 260: the edit card's words (`account.edit.*`) and the phone box's own errors, in the page's language
  const edit = extras?.edit ?? null;
  const editWords = edit ? editWordsOf(c) : {};
  const editLines = edit
    ? edit.state.lines.map((x) => {
        const l = r.lines.find((y) => y.id === x.lineId);
        return { lineId: x.lineId, name: l ? nameOf(l, c) : x.label, detail: l?.colour ? colourName(l.colour, c.lang) : '', choices: x.choices };
      })
    : [];
  // follow-up 261: each open question in the page's words ("Polo · Navy: S and M. …")
  const twoSize = extras?.twoSize?.questions.length
    ? extras.twoSize.questions.map((q) => ({
        key: q.key,
        sizes: q.sizes,
        text: t('account.twoSize.text', { product: q.product, colour: q.colour ? ` · ${q.colour}` : '', sizes: listText(q.sizes.map((s) => s.label), t('bag.sizes.and')) }),
      }))
    : null;
  // PR 186: which pieces he may still exchange, and his exchanges on this order
  const xs = extras?.exchange ?? null;
  const xLine = (lineId: string) => xs?.lines.find((x) => x.lineId === lineId) ?? null;
  const xRowsOf = (lineId: string) => (xs ? xs.exchanges.filter((x) => x.items.some((i) => i.lineId === lineId)) : []);
  const xTag = (status: string) => {
    const doneish = status === 'COMPLETED';
    const ended = status === 'REJECTED' || status === 'CANCELLED';
    return (
      <span className={doneish ? 'tag' : ended ? 'tag plain' : 'tag warn'} data-testid="order-x-status" data-status={status}>
        <Icon name={doneish ? 'check' : 'clock'} size={12} />
        {t(`account.exchange.status.${status}`)}
      </span>
    );
  };
  function LineExchange({ l }: { l: string }) {
    const x = xLine(l);
    const rows = xRowsOf(l);
    const open = x && xs ? (canSize(x) ? 'size' : canProblem(x, xs.problemReason) ? 'problem' : null) : null;
    if (!rows.length && !open) return null;
    return (
      <div className="row wrap mt12" style={{ gap: 8 }} data-testid="order-line-exchange">
        {rows.map((row) => (
          <span key={row.number} className="tag plain">
            <Icon name="swap" size={12} />
            {t('account.exchange.x.lineTag', { exchange: row.number, status: t(`account.exchange.status.${row.status}`) })}
          </span>
        ))}
        {open ? (
          <a className="btn btn-sm btn-secondary" href={`${hrefIn(c.lang, ROUTES.exchange(r.number))}?line=${encodeURIComponent(l)}`} data-testid="order-exchange-btn" data-kind={open}>
            <Icon name="swap" size={15} />
            {t(open === 'size' ? 'account.exchange.lineBtn' : 'account.exchange.lineBtnProblem')}
          </a>
        ) : null}
      </div>
    );
  }
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
            <OrderTrack c={c} track={view.track} late={late} hours={hours} eta={etaLine} lateWa={lateWa} />
            {news ? (
              <div className={`ord-news mt16${news === 'out' ? '' : ' warn'}`} role="status" data-testid="order-courier-news" data-news={news}>
                <span className="ord-news-i">
                  <Icon name={news === 'out' ? 'truck' : 'info'} size={18} />
                </span>
                <div>
                  <div className="bold small">{t(`account.track.news.${news}.title`)}</div>
                  <div className="xs text2" style={{ marginTop: 2 }}>
                    {t(`account.track.news.${news}.text`)}
                  </div>
                </div>
              </div>
            ) : null}
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
          {twoSize ? <TwoSizeCard words={{ ...prefixed(c, 'account.twoSize.'), offline: t('account.err.offline') }} number={r.number} questions={twoSize} /> : null}
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
                    {xs ? <LineExchange l={l.id} /> : null}
                  </div>
                  {/* PR 65: the review sits on its own full-width row of the line, so the stars and the two
                      measurement boxes have the whole card to use on a 320 px phone, not the text column */}
                  {review ? (
                    <div className="ord-rev-slot">
                      {review.reviewed[l.id] ? (
                        <ReviewState words={reviewWords} state={review.reviewed[l.id]!} />
                      ) : review.ask ? (
                        <ReviewForm
                          words={reviewWords}
                          number={r.number}
                          orderItemId={l.id}
                          name={name}
                          askFit={review.askFit}
                          askBody={review.askBody}
                          bodyMax={review.bodyMax}
                          photos={review.photos}
                          photoMaxMb={review.photoMaxMb}
                          rewardText={rewardText}
                        />
                      ) : null}
                    </div>
                  ) : null}
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
          {xs && xs.exchanges.length ? (
            <section className="card" aria-labelledby="ox-h" data-testid="order-exchanges">
              <div className="ord-cardhd">
                <h2 className="h3" id="ox-h">
                  {t('account.exchange.list')}
                </h2>
                <span className="xs muted">{plural(t, 'account.exchange.requests', xs.exchanges.length, c.num)}</span>
              </div>
              {xs.exchanges.map((x) => {
                const item = x.items[0];
                const old = item?.lineId ? r.lines.find((l) => l.id === item.lineId) : undefined;
                const oldName = old ? nameOf(old, c) : (item?.oldSku ?? '');
                const money: ReactNode[] = [];
                if (x.money.codMinor > 0) money.push(<span key="pay">{t('account.exchange.x.pay', { amount: m(x.money.codMinor) })}</span>);
                if (x.money.creditMinor > 0)
                  money.push(
                    <span key="wallet">
                      {t('account.exchange.x.wallet', { amount: m(x.money.creditMinor) })} {t(x.status === 'COMPLETED' ? 'account.exchange.x.walletAdded' : 'account.exchange.x.walletAfter')}
                    </span>,
                  );
                if (!money.length) money.push(<span key="none">{t('account.exchange.money.nothing')}</span>);
                return (
                  <div className="ord-x" key={x.number} data-testid="order-x" data-number={x.number}>
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <b className="small">{x.number}</b>
                        <span className="xs muted">
                          {t(`account.exchange.reasonOf.${x.reason}`)} · {dateText(c, x.createdAt)}
                        </span>
                      </div>
                      {xTag(x.status)}
                    </div>
                    {item ? (
                      <div className="ord-x-swap mt12">
                        <div className="ord-thumb" style={{ width: 44 }}>
                          <Thumb c={c} card={old?.productId ? cards.get(old.productId) : undefined} colourKey={old?.colour?.key || undefined} hex={old?.colour?.hex ?? ''} alt={oldName} />
                        </div>
                        <div className="xs" style={{ minWidth: 0 }}>
                          <div className="muted">{t('account.exchange.sendBack')}</div>
                          <div className="bold">{oldName}</div>
                          <div className="text2">{[old?.colour ? colourName(old.colour, c.lang) : null, old?.size].filter(Boolean).join(' · ')}</div>
                        </div>
                        <span className="ord-x-arr" aria-hidden="true">
                          <Icon name="right" size={16} />
                        </span>
                        <div className="ord-thumb" style={{ width: 44 }}>
                          <Thumb c={c} card={item.newProductId ? cards.get(item.newProductId) : undefined} colourKey={item.newColour?.key || undefined} hex={item.newColour?.hex ?? ''} alt={item.newName ?? ''} />
                        </div>
                        <div className="xs" style={{ minWidth: 0 }}>
                          <div className="muted">{t('account.exchange.newItem')}</div>
                          <div className="bold">{item.newName ?? ''}</div>
                          <div className="text2">{[item.newColourName, item.newSizeLabel].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    ) : null}
                    <div className="small text2 mt12 row wrap" style={{ gap: '4px 10px' }} data-testid="order-x-money">
                      {money}
                    </div>
                    {x.claimState ? (
                      <div className="xs text2 mt8" data-testid="order-x-claim" data-claim={x.claimState}>
                        {t(`account.exchange.claim.${x.claimState}`)}
                      </div>
                    ) : null}
                    {x.newOrderNumber ? (
                      <a className="link xs bold mt8" style={{ display: 'inline-block' }} href={hrefIn(c.lang, ROUTES.order(x.newOrderNumber))} data-testid="order-x-new">
                        {t('account.exchange.newOrder', { number: x.newOrderNumber })}
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}
          {edit ? (
            <OrderEditCard
              words={editWords}
              number={r.number}
              open={edit.state.open}
              closed={edit.state.closed}
              openText={t(edit.until === 'placed' ? 'account.edit.openPlaced' : 'account.edit.openConfirmed')}
              leftText={plural(t, 'account.edit.left', edit.state.editsLeft, c.num)}
              buttonText={plural(t, 'account.edit.button', edit.state.editsLeft, c.num)}
              closedText={edit.state.closed === 'CAP' ? plural(t, 'account.edit.closed.CAP', edit.state.maxEdits, c.num) : edit.state.closed ? t(`account.edit.closed.${edit.state.closed}`) : null}
              savedTexts={Array.from({ length: edit.state.editsLeft + 1 }, (_, n) => (n === 0 ? t('account.edit.savedLast') : plural(t, 'account.edit.saved', n, c.num)))}
              can={edit.state.can}
              phone={phoneNormalizeBD(edit.state.phone).nice || (edit.state.phone ?? '')}
              address={edit.state.address ?? ''}
              lines={editLines}
            />
          ) : null}
          {extras?.life ? <OrderLife c={c} steps={extras.life} /> : null}
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
          {extras?.refunds?.length ? (
            <section className="card p20" aria-labelledby="orf-h" data-testid="order-refunds">
              <h2 className="h3" id="orf-h">
                {t('account.refund.title')}
              </h2>
              {extras.refunds.map((x, i) => (
                <div key={i} className="soft ord-pay mt12" data-testid="order-refund" data-state={x.state}>
                  <div className="small bold">{t(x.state === 'checking' ? 'account.refund.asked' : x.toWallet ? 'account.refund.toWallet' : 'account.refund.back', { amount: m(x.amountMinor) })}</div>
                  <div className="xs muted">{t(`account.refund.${x.state}`, { date: dateText(c, new Date(x.at).toISOString(), false) })}</div>
                </div>
              ))}
            </section>
          ) : null}
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
