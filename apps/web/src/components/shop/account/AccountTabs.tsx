// PR 131 — the sections of My account, server-drawn (demo 60-account.js acc_tabOrders, acc_orderCard, acc_trackFlow,
// acc_tabForYou, acc_tabRewards, acc_tabWallet, V12.2). Every figure is read from what is stored: the order's own state
// and times (the steps only show them; moving an order is S05's, CN-022), the wallet's own ledger.
// Left out until the systems that make them true: the demo's "15% personal offer" and member prices (a made-up
// discount), the saved-size card (the size finder's saved size), referral and photo-review rewards, the "best sellers"
// rows (sales figures), ~~the invoice button (PR 136)~~ and the exchange-window tag (S06).
// PR 136: the invoice icon beside the order number opens that order's invoice (demo R16 acc-oinv), while the owner keeps
// invoices on (`account.invoice`).
import type { ReactNode } from 'react';
import type { OrderCard, WalletView } from '@extas/accounts';
import { TRACK_STEPS } from '@extas/accounts/pure';
import type { ShopIcon } from '@extas/settings';
import { cardsByIds, type ShopCard } from '@/lib/shop/catalogue';
import { readPageSettings, type ShopContext } from '@/lib/shop/context';
import { dateText } from '@/lib/shop/account-view';
import { plural } from '@/lib/shop/bag-model';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { Icon } from '../Icon';
import { ProductCard } from '../ProductCard';
import { nameOf, Thumb } from '../bag/BagLines';

/** The four pictures of the parcel's journey after "Placed" (demo note 44): a tick, the box, the courier, at the door. */
const FLOW: [Exclude<(typeof TRACK_STEPS)[number], 'placed'>, ShopIcon][] = [
  ['confirmed', 'check'],
  ['packed', 'box'],
  ['courier', 'truck'],
  ['delivered', 'home'],
];

/** The state as a tag: a tick when delivered, the truck while with the courier, a clock while waiting, plain when stopped. */
export function StatusTag({ c, o }: { c: ShopContext; o: Pick<OrderCard, 'status' | 'track'> }) {
  const stopped = o.track.ended !== null;
  const moving = o.status === 'HANDED_OVER' || o.status === 'IN_TRANSIT';
  const cls = o.track.done || moving ? 'tag' : stopped ? 'tag plain' : 'tag warn';
  return (
    <span className={cls} data-testid="acc-status" data-status={o.status}>
      <Icon name={o.track.done ? 'check' : moving ? 'truck' : stopped ? 'close' : 'clock'} size={12} />
      {c.t(`account.status.${o.status}`)}
    </span>
  );
}

/** PR 135 (SIM-F-018): past its band's promise in hours and still on its way. */
export function LateTag({ c }: { c: ShopContext }) {
  return (
    <span className="tag sale" data-testid="acc-late">
      <Icon name="clock" size={12} />
      {c.t('account.track.lateTag')}
    </span>
  );
}

/** The parcel's journey in pictures; the whole rail opens the order (demo acc_trackFlow). */
export function TrackFlow({ c, o }: { c: ShopContext; o: OrderCard }) {
  const cur = o.track.reached - 1;
  return (
    <a className="acc-flow" href={hrefIn(c.lang, ROUTES.order(o.number))} aria-label={c.t('account.orders.trackName', { number: o.number })} data-testid="acc-flow">
      {FLOW.map(([k, icon], i) => {
        const done = i <= cur;
        const now = i === cur && !o.track.ended;
        return (
          <span key={k} className={`acc-fstep${done ? ' done' : ''}${now ? ' now' : ''}`} data-step={k}>
            <span className="acc-fdot">
              <Icon name={icon} size={19} />
            </span>
            <span className="acc-flbl">{c.t(`account.step.${k}`)}</span>
            {i < FLOW.length - 1 ? <span className={`acc-fline${i < cur ? ' on' : ''}`} aria-hidden="true" /> : null}
          </span>
        );
      })}
    </a>
  );
}

function OrderCardView({ c, o, cards, invoice }: { c: ShopContext; o: OrderCard; cards: Map<string, ShopCard>; invoice: boolean }) {
  const t = c.t;
  const href = hrefIn(c.lang, ROUTES.order(o.number));
  return (
    <article className="card acc-ocard" data-testid="acc-ocard" data-number={o.number}>
      <div>
        <div className="acc-onum">
          <a className="h3 acc-onum-a" href={href} aria-label={t('account.orders.open', { number: o.number })}>
            #{o.number}
          </a>
          {invoice ? (
            <a className="acc-oinv" href={hrefIn(c.lang, ROUTES.invoice(o.number))} aria-label={t('account.invoice.icon', { number: o.number })} title={t('account.invoice.crumb')} data-testid="acc-oinv">
              <Icon name="doc" size={18} />
            </a>
          ) : null}
        </div>
        <div className="xs muted" style={{ marginTop: 2 }}>
          {t('account.orders.placed', { date: dateText(c, o.placedAt) })} · {plural(t, 'account.orders.items', o.items, c.num)}
        </div>
        <div className="row wrap mt8" style={{ gap: 6 }}>
          <StatusTag c={c} o={o} />
          {o.late ? <LateTag c={c} /> : null}
        </div>
      </div>
      <div className="acc-ordmid">
        <div className="acc-thumbs">
          {o.lines.map((l, i) => {
            const name = nameOf(l, c);
            return (
              <div className="acc-thumb" key={`${l.productId ?? 'x'}-${i}`}>
                <Thumb c={c} card={l.productId ? cards.get(l.productId) : undefined} colourKey={l.colour?.key || undefined} hex={l.colour?.hex ?? ''} alt={name} />
              </div>
            );
          })}
          {o.more > 0 ? <div className="acc-more">{t('account.orders.more', { n: c.num(o.more) })}</div> : null}
        </div>
        <TrackFlow c={c} o={o} />
      </div>
      <div className="acc-ocard-r">
        <div>
          <div className="xs muted">{t('account.orders.total')}</div>
          <div className="price acc-ototal">{c.money(o.totalMinor)}</div>
        </div>
        <a className="btn btn-sm btn-secondary" href={href} aria-label={t('account.orders.trackName', { number: o.number })} data-testid="acc-track">
          <Icon name="truck" size={15} />
          {t('account.orders.track')}
          <Icon name="right" size={15} />
        </a>
      </div>
    </article>
  );
}

export async function OrdersTab({ c, orders }: { c: ShopContext; orders: OrderCard[] }) {
  const t = c.t;
  const ids = [...new Set(orders.flatMap((o) => o.lines.flatMap((l) => (l.productId ? [l.productId] : []))))];
  const [cards, more] = await Promise.all([
    ids.length ? cardsByIds(c.storeId, ids) : Promise.resolve(new Map<string, ShopCard>()),
    readPageSettings(['account.invoice'] as const, c.storeId),
  ]);
  const invoice = more['account.invoice'].enabled;
  return (
    <section aria-labelledby="ao-h" data-testid="acc-orders">
      <div className="sec-hd">
        <h2 className="h2" id="ao-h">
          {t('account.orders.title')}
        </h2>
        <span className="small muted">{plural(t, 'account.orders.count', orders.length, c.num)}</span>
      </div>
      {orders.length ? (
        <div className="stack s12">
          {orders.map((o) => (
            <OrderCardView key={o.number} c={c} o={o} cards={cards} invoice={invoice} />
          ))}
        </div>
      ) : (
        <div className="card empty" data-testid="acc-orders-empty">
          <div className="h3" style={{ color: 'var(--ink)' }}>
            {t('account.orders.emptyTitle')}
          </div>
          <p className="small" style={{ margin: '6px 0 14px' }}>
            {t('account.orders.emptyText')}
          </p>
          <a className="btn btn-primary" href={hrefIn(c.lang, ROUTES.newIn)}>
            {t('account.orders.start')}
          </a>
        </div>
      )}
    </section>
  );
}

/** For you: his offers (the owner's own, PR 132), then the newest styles (`account.lists.newIn`; 0 = off). */
export function ForYouTab({ c, newIn, offers = null }: { c: ShopContext; newIn: ShopCard[]; offers?: ReactNode }) {
  const t = c.t;
  return (
    <div className="stack s24" data-testid="acc-foryou">
      <section aria-labelledby="fy-o">
        <div className="sec-hd">
          <h2 className="h2" id="fy-o">
            {t('account.foryou.offersTitle')}
          </h2>
        </div>
        {offers ?? (
          <div className="card p20 small text2" data-testid="acc-offers-none">
            {t('account.foryou.none')}
          </div>
        )}
      </section>
      {newIn.length ? (
        <section aria-labelledby="fy-n">
          <div className="sec-hd">
            <h2 className="h2" id="fy-n">
              {t('account.foryou.newIn')}
            </h2>
            <a className="link" href={hrefIn(c.lang, ROUTES.newIn)}>
              {t('account.foryou.seeAll')}
            </a>
          </div>
          <div className="scroll-x acc-slrow">
            {newIn.map((p) => (
              <div className="acc-pcell" key={p.id}>
                <ProductCard card={p} c={c} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Rewards: nothing is made up — until a rewards programme runs, it says so plainly. */
export function RewardsTab({ c }: { c: ShopContext }) {
  const t = c.t;
  return (
    <section className="card p20" aria-labelledby="rw-h" data-testid="acc-rewards">
      <div className="row between top" style={{ gap: 12 }}>
        <div>
          <h2 className="h2" id="rw-h">
            {t('account.rewards.title')}
          </h2>
          <p className="small text2" style={{ margin: '8px 0 0' }}>
            {t('account.rewards.none')}
          </p>
          <p className="xs muted" style={{ margin: '6px 0 0' }}>
            {t('account.rewards.noneNote')}
          </p>
        </div>
        <span className="acc-oico shrink0">
          <Icon name="gift" size={20} />
        </span>
      </div>
    </section>
  );
}

/** The wallet: the real balance and its ledger, newest first (demo acc_tabWallet). */
export function WalletTab({ c, wallet, usable }: { c: ShopContext; wallet: WalletView | null; usable: boolean }) {
  const t = c.t;
  const entries = wallet?.entries ?? [];
  const label = (e: WalletView['entries'][number]) =>
    e.orderNumber ? t(e.direction === 'DEBIT' ? 'account.wallet.order' : 'account.wallet.orderCredit', { number: e.orderNumber }) : t(e.direction === 'DEBIT' ? 'account.wallet.debit' : 'account.wallet.credit');
  return (
    <div className="stack s16" data-testid="acc-wallet">
      <section className="card acc-wal" aria-labelledby="w-h">
        <div className="acc-wal-top">
          <div>
            <div className="eyebrow" id="w-h">
              {t('account.wallet.balance')}
            </div>
            <div className="display acc-bal" data-testid="acc-balance">
              {c.money(wallet?.balanceMinor ?? 0)}
            </div>
            <div className="small text2">{wallet && wallet.balanceMinor > 0 ? (usable ? t('account.wallet.ready') : null) : t('account.wallet.none')}</div>
          </div>
          <span className="acc-wal-i">
            <Icon name="wallet" size={26} />
          </span>
        </div>
      </section>
      <section className="card" aria-labelledby="w-tx">
        <div className="ord-cardhd">
          <h2 className="h3" id="w-tx">
            {t('account.wallet.tx')}
          </h2>
          <span className="xs muted">{plural(t, 'account.wallet.entries', entries.length, c.num)}</span>
        </div>
        {entries.length ? (
          entries.map((e) => (
            <div className="acc-tx" key={e.id} data-testid="acc-tx">
              <div style={{ minWidth: 0 }}>
                <div className="small bold">{label(e)}</div>
                <div className="xs muted">{dateText(c, e.at)}</div>
              </div>
              <div className={`amt${e.direction === 'CREDIT' ? ' pos' : ''}`}>
                {e.direction === 'CREDIT' ? '+' : '−'}
                {c.money(e.amountMinor)}
              </div>
            </div>
          ))
        ) : (
          <div className="acc-tx small muted">{t('account.wallet.noTx')}</div>
        )}
      </section>
    </div>
  );
}
