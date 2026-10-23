// PR 126 — the thank-you page (demo 52-thanks.js, V12.2): the tick and "Thank you, Rahim!", the delivery promise of
// the order's own band in hours (or that we call to confirm an address being checked), the order number with Copy,
// what is still to pay (Cash on Delivery due at the door, paid, "Pay now" while a prepaid payment waits, "Try again"
// after a failed one), the order's lines and money as stored, the WhatsApp button and "Keep shopping".
// Left out until their PRs (the copy says only what the shop really does): the SMS line (no SMS is sent yet), ~~"Track
// your order" (PR 135)~~, "Complete your look" (PR 128) ~~and the next-steps timeline~~.
// Follow-up 58 (`thanks.page`): the delivery note he wrote, said back (on); the trial-at-the-door line while that
// service is on (`checkout.tryOn.enabled`); and "What happens next" (off, as in the demo: `thanks.nextSteps`).
// PR 135: "Track your order" opens the order's own page in My account with its welcome panel (`?from=thanks`).
// PR 129: the account card — "Your account is ready" (or "This order is in your account") with the number he logs in
// with and that the code comes by SMS to it. Never a password (SIM-F-039); "You're logged in" when he ordered signed in.
// PR 136: "Invoice · print or download" under the order's money opens its invoice (demo inv-btn), while invoices are on.
// PR 565: a free order shows no band name and no "we call about the area" line, only its promise in hours.
// PR 127: a line added after placing ("Add to this parcel") carries the demo's "Added" tag (ty_items).
import '../bag/bag.css';
import './checkout.css';
import type { Receipt } from '@extas/checkout';
import type { ThanksPageSettings } from '@extas/settings';
import { cardsByIds, colourName } from '@/lib/shop/catalogue';
import { checkoutWords } from '@/lib/shop/checkout';
import type { ShopContext } from '@/lib/shop/context';
import { fill } from '@/lib/shop/dict';
import { hoursOf, named } from '@/lib/shop/checkout-model';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { nextSteps, placedText } from '@/lib/shop/thanks-model';
import { Icon, WaGlyph } from '../Icon';
import { nameOf, Thumb } from '../bag/BagLines';
import { CopyNumber, RetryPayment } from './ThanksActions';

export function ThanksNotFound({ c }: { c: ShopContext }) {
  return (
    <div className="container co-wrap">
      <div className="card center co-empty" data-testid="ty-not-found">
        <h1 className="h1">{c.t('checkout.ty.notFoundTitle')}</h1>
        <p className="text2">{c.t('checkout.ty.notFoundText')}</p>
        <a className="btn btn-primary mt16" href={hrefIn(c.lang, ROUTES.home)}>
          {c.t('checkout.ty.keep')}
        </a>
      </div>
    </div>
  );
}

/** PR 129 — the account the order went to: the number to log in with and the SMS code, never a password. */
function AccountCard({ c, r }: { c: ShopContext; r: Receipt }) {
  if (!r.account) return null;
  const go = (
    <a className="btn btn-secondary btn-block mt12" href={hrefIn(c.lang, ROUTES.account)} data-testid="ty-account-go">
      {c.t('account.ty.go')}
    </a>
  );
  const head = (title: string) => (
    <div className="row" style={{ gap: 10 }}>
      <span className="ty-ic">
        <Icon name="user" size={19} />
      </span>
      <div className="h3">{title}</div>
    </div>
  );
  if (r.account === 'signedIn')
    return (
      <section className="card p20 ty-acc" data-testid="ty-account" data-account="signedIn">
        {head(c.t('account.ty.signedTitle'))}
        <p className="small text2 mt8">{c.t('account.ty.signedText')}</p>
        {go}
      </section>
    );
  return (
    <section className="card p20 ty-acc" data-testid="ty-account" data-account={r.account}>
      {head(c.t(r.account === 'created' ? 'account.ty.readyTitle' : 'account.ty.inTitle'))}
      <div className="ty-cred3 mt12" data-testid="ty-cred">
        <div className="ty-cred3-hd">{c.t('account.ty.loginWith')}</div>
        <div className="ty-crow">
          <span className="k">{c.t('account.ty.phone')}</span>
          <span className="v">
            <b data-testid="ty-account-phone">{r.phone}</b>
          </span>
        </div>
        <div className="ty-crow">
          <span className="k">{c.t('account.ty.code')}</span>
          <span className="v small text2">{c.t('account.ty.codeVal')}</span>
        </div>
      </div>
      <p className="xs text2 ty-accnote">{c.t('account.ty.note')}</p>
      {go}
    </section>
  );
}

export async function ThanksPage({
  c,
  r,
  waOn,
  more,
  tryOn,
  accountCard = true,
  invoice = false,
}: {
  c: ShopContext;
  r: Receipt;
  waOn: boolean;
  more: ThanksPageSettings;
  tryOn: boolean;
  accountCard?: boolean;
  /** PR 136: the owner keeps invoices on (`account.invoice`). */
  invoice?: boolean;
}) {
  const words = checkoutWords(c);
  const w = (k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);
  const m = c.money;
  const n = (x: number) => c.num(x);
  const methodName = (p: { method: string | null; provider: string | null }) =>
    p.method === 'ONLINE' || p.provider === 'online' ? w('pay.online') : p.provider && words[`pm.${p.provider}`] ? w(`pm.${p.provider}`) : (p.provider ?? p.method ?? '');
  const pay = r.pay;
  const waiting = pay.kind === 'due' || pay.kind === 'failed';
  const hours = r.band ? hoursOf(r.band, n) : null;
  // PR 565: a free order never says "we call about the area" and never names a band — only its promise, when it has one
  const promise = r.freeDelivery ? (hours ? w('del.promise', { hours }) : null) : r.addressUnclear || !r.band ? w('ty.etaCall') : hours ? w('del.promise', { hours }) : null;
  const cards = await cardsByIds(c.storeId, r.lines.map((l) => l.productId).filter((x): x is string => !!x));
  const wa = waOn ? waHref(c.s['contact.whatsapp'], w('ty.waMsg', { number: r.number })) : null;
  // follow-up 58 · the trial at the door (the shop's own switch), the note said back, what happens next
  const trial = tryOn ? (
    <p className="trial-ln ty-trial" data-testid="ty-trial">
      <Icon name="check" size={14} />
      <span>{c.t('pdp.rules.trial')}</span>
    </p>
  ) : null;
  const note =
    more.noteBack && r.note ? (
      <section className="card p20 ty-note" data-testid="ty-note">
        <div className="xs muted">{c.t('tyMore.note')}</div>
        <p className="small mt8 ty-note-t">{r.note}</p>
      </section>
    ) : null;
  const steps = more.nextSteps
    ? nextSteps(
        { placed: c.t('tyMore.placed'), confirm: c.t('tyMore.confirm'), courier: c.t('tyMore.courier'), delivered: c.t('tyMore.delivered') },
        placedText(r.placedAt, c.s['store.timeZone'], c.lang, c.bnDigits),
        promise,
      )
    : [];
  const timeline = steps.length ? (
    <section className="card p20" data-testid="ty-timeline">
      <h2 className="h3" style={{ marginBottom: 14 }}>
        {c.t('tyMore.next')}
      </h2>
      <ol className="tl">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="tl-step" aria-current={s.state === 'now' ? 'step' : undefined}>
              <div className="tl-rail">
                <div className={`tl-dot${s.state === 'done' ? ' done' : s.state === 'now' ? ' now' : ''}`} aria-hidden="true">
                  {s.state === 'done' ? <Icon name="check" size={13} /> : n(i + 1)}
                </div>
                {last ? null : <div className={`tl-line${s.state === 'done' ? ' done' : ''}`} />}
              </div>
              <div style={{ paddingBottom: last ? 0 : 16 }}>
                <div className="h3">{s.title}</div>
                {s.note ? <div className="small muted">{s.note}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  ) : null;

  const payBox =
    pay.kind === 'cod' ? (
      <div className="tint ty-pay row top" data-testid="ty-pay" data-pay="cod">
        <span className="ty-ic">
          <Icon name="cash" size={20} />
        </span>
        <div>
          <div className="h3">{w('ty.codTitle', { amount: m(pay.dueMinor) })}</div>
          <div className="small text2" style={{ marginTop: 2 }}>
            {w('ty.codNote')}
            {r.chargeFixed ? null : ` ${w('ty.codCall')}`}
          </div>
          {trial}
        </div>
      </div>
    ) : pay.kind === 'paid' ? (
      <div className="tint ty-pay row top" data-testid="ty-pay" data-pay="paid">
        <span className="ty-ic">
          <Icon name="check" size={20} />
        </span>
        <div>
          <div className="h3">{pay.method === 'WALLET' || pay.paidMinor === 0 ? w('ty.walletTitle') : w('ty.paidTitle', { amount: m(pay.paidMinor), method: methodName(pay) })}</div>
          {pay.mock ? (
            <div className="xs muted" style={{ marginTop: 2 }}>
              {w('ty.mockNote')}
            </div>
          ) : null}
        </div>
      </div>
    ) : (
      <div className="tint ty-pay row top" data-testid="ty-pay" data-pay={pay.kind}>
        <span className="ty-ic">
          <Icon name={pay.kind === 'failed' ? 'info' : 'lock'} size={20} />
        </span>
        <div className="grow">
          <div className="h3">{pay.kind === 'failed' ? w('ty.failedTitle') : w('ty.dueTitle', { amount: m(pay.dueMinor), method: methodName(pay) })}</div>
          <div className="small text2" style={{ marginTop: 2 }}>
            {w(pay.kind === 'failed' ? 'ty.failedNote' : 'ty.dueNote')}
          </div>
          {pay.kind === 'failed' ? (
            <RetryPayment number={r.number} lang={c.lang} words={words} />
          ) : (
            <a className="btn btn-primary btn-block mt12" href={hrefIn(c.lang, ROUTES.checkoutPay(r.number))} data-testid="ty-pay-now">
              <Icon name="lock" size={18} />
              {w('ty.payNow')}
            </a>
          )}
        </div>
      </div>
    );

  const row = (k: string, v: React.ReactNode, cls = '', testId?: string) => (
    <div className={`ty-r${cls ? ` ${cls}` : ''}`} data-testid={testId}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
  const items = (
    <section className="card p20" data-testid="ty-items">
      <div className="row between">
        <div className="h3">{w('ty.items')}</div>
        <span className="xs muted">{r.address}</span>
      </div>
      <div className="mt8">
        {r.lines.map((l) => {
          const name = nameOf(l, c);
          return (
            <div key={l.id} className="ty-it" data-testid="ty-line">
              <div className="co-th">
                <Thumb c={c} card={l.productId ? cards.get(l.productId) : undefined} colourKey={l.colour?.key || undefined} hex={l.colour?.hex ?? ''} alt={name} />
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small bold">
                  {name}
                  {l.isAddOn ? (
                    <>
                      {' '}
                      <span className="tag" data-testid="ty-addline">
                        <Icon name="plus" size={12} />
                        {w('ty.added')}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="xs muted">{[l.colour ? colourName(l.colour, c.lang) : null, l.size, l.quantity > 1 ? `×${n(l.quantity)}` : null].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="small price">{m(l.amountMinor)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--line2)', marginTop: 6, paddingTop: 8 }}>
        {row(w('sum.subtotal'), m(r.subtotalMinor))}
        {r.discountMinor > 0 ? row(w('ty.discount'), `−${m(r.discountMinor)}`, 'disc') : null}
        {r.walletMinor > 0 ? row(w('wallet.row'), `−${m(r.walletMinor)}`, 'disc') : null}
        {row(
          w('sum.delivery'),
          !r.chargeFixed ? (
            <span className="muted">{w('sum.onCall')}</span>
          ) : r.deliveryMinor === 0 ? (
            <span className="bg-freeb">
              <Icon name="check" size={13} />
              {w('sum.free')}
            </span>
          ) : (
            m(r.deliveryMinor)
          ),
          '',
          'ty-delivery',
        )}
      </div>
      <div className="ty-r ty-tot">
        <span>{w('sum.total')}</span>
        <span className="price" data-testid="ty-total">
          {m(r.totalMinor)}
        </span>
      </div>
      {invoice ? (
        <a className="btn btn-secondary btn-block mt12 inv-btn" href={hrefIn(c.lang, ROUTES.invoice(r.number))} data-testid="ty-invoice">
          <Icon name="doc" size={16} />
          {c.t('account.invoice.thanks')}
        </a>
      ) : null}
    </section>
  );

  return (
    <div data-testid="ty-page">
      <section className="container ty-hero">
        <div className="ty-check">
          <Icon name="check" size={38} />
        </div>
        <h1 className="h1">{r.firstName ? w('ty.title', { name: r.firstName }) : w('ty.titleNoName')}</h1>
        <p className="ty-sub">{w(waiting ? 'ty.subPay' : 'ty.sub')}</p>
        {promise ? (
          <div className="ty-eta" data-testid="ty-eta">
            <span className="ty-eta-ic">
              <Icon name="truck" size={22} />
            </span>
            <span className="ty-eta-tx">
              <h2 className="ty-eta-t">{promise}</h2>
              {r.band && !r.addressUnclear && !r.freeDelivery ? <span className="ty-eta-z">{named(c.lang, r.band.nameEn, r.band.nameBn)}</span> : null}
            </span>
          </div>
        ) : null}
        <div className="ty-ordrow">
          <div className="ty-ord">
            <span className="small muted">{w('ty.number')}</span>
            <b className="price" data-testid="ty-id">
              #{r.number}
            </b>
            <CopyNumber number={r.number} words={words} />
          </div>
          <a className="btn btn-primary ty-track" href={`${hrefIn(c.lang, ROUTES.order(r.number))}?from=thanks`} data-testid="ty-track">
            <Icon name="truck" size={19} />
            {c.t('account.track.button')}
          </a>
        </div>
      </section>
      <div className="container ty-wrap">
        <div className="ty-cols">
          <div className="ty-col">
            <div style={{ order: 1 }}>{payBox}</div>
            {timeline ? <div style={{ order: 5 }}>{timeline}</div> : null}
            <div style={{ order: 6 }}>{items}</div>
            {note ? <div style={{ order: 7 }}>{note}</div> : null}
            <div style={{ order: 10 }}>
              <div className="ty-endbtns">
                <a className="btn btn-ghost btn-block ty-keep" href={hrefIn(c.lang, ROUTES.home)} data-testid="ty-keep">
                  {w('ty.keep')}
                </a>
              </div>
            </div>
          </div>
          <div className="ty-col">
            {accountCard && r.account ? (
              <div style={{ order: 3 }}>
                <AccountCard c={c} r={r} />
              </div>
            ) : null}
            {wa ? (
              <div style={{ order: 8 }}>
                <a className="wa-btn wa-real btn-block ty-wa" href={wa} target="_blank" rel="noopener" data-testid="ty-wa">
                  <WaGlyph size={21} />
                  <span className="wa-lbl">{w('ty.wa')}</span>
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
