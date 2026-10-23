// PR 126 — the thank-you page (demo 52-thanks.js, V12.2): the tick and "Thank you, Rahim!", the delivery promise of
// the order's own band in hours (or that we call to confirm an address being checked), the order number with Copy,
// what is still to pay (Cash on Delivery due at the door, paid, "Pay now" while a prepaid payment waits, "Try again"
// after a failed one), the order's lines and money as stored, the WhatsApp button and "Keep shopping".
// Left out until their PRs (the copy says only what the shop really does): the SMS line (no SMS is sent yet), "Track
// your order" (PR 135), the account card (PR 129), "Complete your look" (PR 128) and the next-steps timeline.
import '../bag/bag.css';
import './checkout.css';
import type { Receipt } from '@extas/checkout';
import { cardsByIds, colourName } from '@/lib/shop/catalogue';
import { checkoutWords } from '@/lib/shop/checkout';
import type { ShopContext } from '@/lib/shop/context';
import { fill } from '@/lib/shop/dict';
import { hoursOf, named } from '@/lib/shop/checkout-model';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
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

export async function ThanksPage({ c, r, waOn }: { c: ShopContext; r: Receipt; waOn: boolean }) {
  const words = checkoutWords(c);
  const w = (k: string, vars: Record<string, string> = {}) => fill(words[k] ?? k, vars);
  const m = c.money;
  const n = (x: number) => c.num(x);
  const methodName = (p: { method: string | null; provider: string | null }) =>
    p.method === 'ONLINE' || p.provider === 'online' ? w('pay.online') : p.provider && words[`pm.${p.provider}`] ? w(`pm.${p.provider}`) : (p.provider ?? p.method ?? '');
  const pay = r.pay;
  const waiting = pay.kind === 'due' || pay.kind === 'failed';
  const hours = r.band ? hoursOf(r.band, n) : null;
  const promise = r.addressUnclear || !r.band ? w('ty.etaCall') : hours ? w('del.promise', { hours }) : null;
  const cards = await cardsByIds(c.storeId, r.lines.map((l) => l.productId).filter((x): x is string => !!x));
  const wa = waOn ? waHref(c.s['contact.whatsapp'], w('ty.waMsg', { number: r.number })) : null;

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
                <div className="small bold">{name}</div>
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
              {r.band && !r.addressUnclear ? <span className="ty-eta-z">{named(c.lang, r.band.nameEn, r.band.nameBn)}</span> : null}
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
        </div>
      </section>
      <div className="container ty-wrap">
        <div className="ty-cols">
          <div className="ty-col">
            <div style={{ order: 1 }}>{payBox}</div>
            <div style={{ order: 6 }}>{items}</div>
            <div style={{ order: 10 }}>
              <div className="ty-endbtns">
                <a className="btn btn-ghost btn-block ty-keep" href={hrefIn(c.lang, ROUTES.home)} data-testid="ty-keep">
                  {w('ty.keep')}
                </a>
              </div>
            </div>
          </div>
          <div className="ty-col">
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
