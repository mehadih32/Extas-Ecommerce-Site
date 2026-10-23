'use client';
// PR 120 — step 3, "Payment" (demo 51-checkout.js co_pay, Note 54 #13, CN-012). Cash on Delivery opens by itself; mobile
// banking, card & bank and "Pay online" open on a tap, each with its own wallets or cards as tiles. The options are the
// server's (which methods the owner opened, Cash on Delivery only where the rules and the band allow it); the page only
// sends the choice back and draws the answer. A prepaid reward the owner switched on shows on every prepaid option.
// On a phone, before one finished word of the address, the step only names what can be paid with (demo rule 39); a
// computer always shows the boxes.
// PR 605: a gift paid ahead in full says why Cash on Delivery is not there.
import type { PaymentChoice, PaymentView, PayMethod } from '@extas/checkout/pure';
import { Icon } from '../Icon';
import { PayMark } from './PayMark';

export interface PaymentStepProps {
  pay: PaymentView;
  /** The amount the customer pays on this choice (the total, or "৳X + delivery"). */
  due: string;
  /** The phone's boxes are open (one finished word of the address). */
  open: boolean;
  w: (key: string, vars?: Record<string, string | number>) => string;
  m: (minor: number) => string;
  n: (x: number) => string;
  onChoose: (c: PaymentChoice) => void;
  /** The WhatsApp help link, for "nothing is open". */
  wa: string | null;
  /** PR 122: the wallet pays the whole order: nothing to choose. */
  covered?: boolean;
}

export function PaymentStep({ pay, due, open, w, m, n, onChoose, wa, covered = false }: PaymentStepProps) {
  const name = (id: string) => w(`pm.${id}`);
  const mark = (id: string) => <PayMark key={id} id={id} name={name(id)} short={w(`mk.${id}`)} />;
  const marks = (list: readonly string[], max: number) => <span className="co-pmks">{list.slice(0, max).map(mark)}</span>;
  const cur = pay.chosen;
  const reward = pay.reward
    ? pay.reward.kind === 'freeDelivery'
      ? w('pay.reward.freeDelivery')
      : w('pay.reward.amount', { amount: m(pay.reward.amountMinor) })
    : null;
  const rewardLine = reward ? (
    <span className="xs brandc co-po-reward" data-testid="co-pay-reward" style={{ display: 'block' }}>
      <Icon name="gift" size={13} /> {reward}
    </span>
  ) : null;
  const head = (n2: number) => (
    <div className="co-hd">
      <span className="co-num">{n(n2)}</span>
      <h2 className="h2">{w('payment')}</h2>
    </div>
  );
  const option = (method: PayMethod, title: string, sub: React.ReactNode, markNode: React.ReactNode, body: React.ReactNode) => {
    const on = cur?.method === method;
    return (
      <div key={method} className={`co-po co-po-${method}${on ? ' on' : ''}`} data-testid={`co-po-${method}`}>
        <button type="button" className="co-po-hd" aria-pressed={on} aria-expanded={on} onClick={() => onChoose({ method, option: on ? (cur?.option ?? null) : null })}>
          <span className="co-radio" aria-hidden="true" />
          <span className="grow co-po-tx">
            <span className="h3" style={{ display: 'block' }}>
              {title}
            </span>
            <span className="xs muted co-po-sub" style={{ display: 'block' }}>
              {sub}
            </span>
            {method !== 'cod' ? rewardLine : null}
          </span>
          <span className="co-po-mk">{markNode}</span>
        </button>
        {on && body ? <div className="co-po-bd">{body}</div> : null}
      </div>
    );
  };
  const tiles = (method: 'mobile' | 'card', list: readonly string[]) => (
    <div className="co-pmt" role="group">
      {list.map((id) => {
        const on = cur?.method === method && cur.option === id;
        return (
          <button key={id} type="button" className={`co-pmtb${on ? ' on' : ''}`} aria-pressed={on} data-testid="co-pay-tile" data-v={id} onClick={() => onChoose({ method, option: id })}>
            {mark(id)}
            <span>{name(id)}</span>
          </button>
        );
      })}
    </div>
  );

  const boxes: React.ReactNode[] = [];
  if (pay.cod)
    boxes.push(
      option(
        'cod',
        w('pay.cod'),
        w('pay.codSub'),
        mark('cod'),
        <div className="small" data-testid="co-cod-note">
          <b>{w('pay.totalDue', { amount: due })}</b> — {w('pay.codRider')}
        </div>,
      ),
    );
  if (pay.mobile.length)
    boxes.push(
      option(
        'mobile',
        w('pay.mobile'),
        marks(pay.mobile, 3),
        null,
        <>
          {tiles('mobile', pay.mobile)}
          <div className="xs muted mt8">{w('pay.mobileNote', { amount: due, wallet: name(cur?.option ?? pay.mobile[0]!) })}</div>
        </>,
      ),
    );
  if (pay.card.length)
    boxes.push(
      option(
        'card',
        w('pay.card'),
        marks(pay.card, 4),
        null,
        <>
          {tiles('card', pay.card)}
          <div className="xs muted mt8">{w('pay.cardNote', { amount: due })}</div>
        </>,
      ),
    );
  if (pay.online) boxes.push(option('online', w('pay.online'), w('pay.onlineSub'), mark('ssl'), <div className="small">{w('pay.onlineNote', { amount: due })}</div>));

  if (covered)
    return (
      <section className="card co-sec co-paysec" data-testid="co-pay">
        {head(3)}
        <p className="co-fdays" data-testid="co-pay-wallet">
          <Icon name="wallet" size={14} />
          <span>{w('pay.walletCovers')}</span>
        </p>
      </section>
    );
  if (!boxes.length)
    return (
      <section className="card co-sec co-paysec" data-testid="co-pay">
        {head(3)}
        <p className="co-fdays" data-testid="co-pay-none">
          <Icon name="info" size={14} />
          <span>
            {wa ? (
              <a className="link" href={wa} target="_blank" rel="noopener">
                {w('pay.none')}
              </a>
            ) : (
              w('pay.none')
            )}
          </span>
        </p>
      </section>
    );

  const names = [...(pay.cod ? ['cod'] : []), ...pay.mobile.slice(0, 2), ...pay.card.slice(0, 2)];
  const soon = open ? null : (
    <section className="card co-sec co-soon" data-testid="co-pay">
      {head(3)}
      <div className="co-soonrow">
        {names.map((id) => (
          <span key={id} className="co-badge">
            {id === 'cod' ? w('pay.cod') : name(id)}
          </span>
        ))}
      </div>
      <p className="co-fdays">
        <Icon name="lock" size={14} />
        <span>{w(pay.cod && cur?.method === 'cod' ? 'pay.soon' : 'pay.soonNoCod')}</span>
      </p>
    </section>
  );
  const full = (
    <section className="card co-sec co-paysec" data-testid={soon ? 'co-pay-desk' : 'co-pay'}>
      {head(3)}
      {pay.codOff === 'RULE' || pay.codOff === 'BAND_LIMIT' || pay.codOff === 'GIFT' ? (
        <p className="co-fdays" data-testid="co-cod-not-here">
          <Icon name="info" size={14} />
          <span>{w(pay.codOff === 'GIFT' ? 'pay.codGift' : 'pay.codNotHere')}</span>
        </p>
      ) : null}
      <div className="stack s8 mt12">{boxes}</div>
    </section>
  );
  if (!soon) return full;
  return (
    <>
      <div className="hide-d">{soon}</div>
      <div className="hide-m">{full}</div>
    </>
  );
}
