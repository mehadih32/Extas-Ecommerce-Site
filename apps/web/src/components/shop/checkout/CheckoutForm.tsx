'use client';
// PR 115 — the checkout page's client part (demo 51-checkout.js co_render): the "Need help? WhatsApp us" line, the
// phone's "Show order summary" bar that opens the summary over the page (a tap outside closes it), the three steps
// (Delivery details, Delivery, Payment), the computer's side summary with Confirm, and the phone's sticky Confirm bar.
// Every word comes from the shop dictionary (`words`, resolved on the server); every amount from the server's quote.
// PR 117: the finished address line is read by the server's gazetteer (a pause or leaving the box, never mid-typing)
// and the page shows the checkout the server priced for it. PR 118: the band he picks when asked. PR 119: the delivery
// charge in the summary and the total — the server's figure, or "free", or "+ delivery" while it is not known.
// PR 120: the payment step; the choice is kept in the tab's draft and priced by the server (the prepaid reward).
// PR 122: "Your offers" with the wallet; the total and Confirm show what is left to pay.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { checkForm, type CheckoutView, type DetailsForm, type Field, type FormLimits, type PaymentChoice } from '@extas/checkout/pure';
import { confirmedOf, payChoiceOf, payOpens } from '@/lib/shop/checkout-model';
import { fill } from '@/lib/shop/dict';
import { formatMoney, formatNumber, type ShopLang } from '@/lib/shop/lang';
import { Icon, WaGlyph } from '../Icon';
import { DeliveryStep } from './DeliveryStep';
import { DetailsFields } from './DetailsFields';
import { OffersCard } from './OffersCard';
import { PaymentStep } from './PaymentStep';
import { nextOnEnter, saveDraft, useDraft } from './draft';
import { fetchQuote, latest, useSettle, type Choices } from './quote-client';

const EMPTY_FORM: DetailsForm = { name: '', phone: '', address: '' };

export interface MoneyFormat {
  currency: string;
  lang: ShopLang;
  bnDigits: boolean;
}

export interface CheckoutFormProps {
  view: CheckoutView;
  words: Record<string, string>;
  money: MoneyFormat;
  /** The summary's lines, drawn on the server (pictures, names, prices). */
  lines: ReactNode;
  /** The WhatsApp help link, or null when the help line is off or there is no number. */
  wa: string | null;
  fields: Field[];
  limits: FormLimits;
  /** When the address counts as finished (`delivery.resolver.settleMs`, `delivery.resolver.minWords`). */
  settle: { settleMs: number; minWords: number };
  /** The longest address the resolver reads (`delivery.resolver.maxChars`). */
  addressMax: number;
}

export function CheckoutForm({ view: first, words, money, lines, wa, fields, limits, settle: timing, addressMax }: CheckoutFormProps) {
  const stored = useDraft();
  const [view, setView] = useState<CheckoutView>(first);
  const [reading, setReading] = useState(false);
  /** The line the delivery step shows the answer for; while the box says something else, it says "Reading …". */
  const [readLine, setReadLine] = useState<string | null>(null);
  const seq = useRef(latest());
  /** What the page last asked the server about: the finished line and the band he chose (PR 118). */
  const asked = useRef<Choices>({ line: null, confirmed: null, pay: null, wallet: false });
  /** Prices the checkout again for what the customer chose; only the newest answer is drawn. */
  const requote = async (patch: Partial<Choices>) => {
    const c = { ...asked.current, ...patch };
    asked.current = c;
    const k = seq.current.next();
    setReadLine(c.line);
    setReading(true);
    const next = await fetchQuote({ lang: money.lang, address: c.line ? { line: c.line, confirmed: c.confirmed } : null, payment: c.pay, useWallet: c.wallet });
    if (!seq.current.isLatest(k)) return;
    setReading(false);
    if (next) setView(next);
  };
  const settle = useSettle({ ...timing, onSettle: (line) => void requote({ line }) });
  // PR 121: a quantity changed or an item went (the bag's script redraws the page): price the new bag with his choices.
  const bagStamp = first.fingerprint;
  const seenStamp = useRef(bagStamp);
  useEffect(() => {
    if (seenStamp.current === bagStamp) return;
    seenStamp.current = bagStamp;
    void requote({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the server drew a different bag
  }, [bagStamp]);
  const [edited, setEdited] = useState<DetailsForm | null>(null);
  // Typed details survive a reload or a pull-to-refresh: kept in this tab only (sessionStorage), never sent from here.
  const form: DetailsForm = edited ?? stored?.form ?? EMPTY_FORM;
  const keep = (next: DetailsForm) => saveDraft({ form: next, confirmed: asked.current.confirmed });
  const [phoneChecked, setPhoneChecked] = useState(false);
  const change = (f: Field, v: string) => {
    const next = { ...form, [f]: v };
    setEdited(next);
    if (f === 'address') {
      // A new address takes back the band he picked for the old one (demo: zonePick = null on every keystroke).
      asked.current = { ...asked.current, confirmed: null };
      settle.input(v);
    }
    keep(next);
  };
  // An address that comes back from this tab's draft is already finished: it is read once, at once (with his band).
  const draftLine = stored?.form.address.trim() ?? '';
  const draftPay = payChoiceOf(stored?.pay);
  useEffect(() => {
    if ((!draftLine && !draftPay) || asked.current.line !== null || asked.current.pay !== null) return;
    void requote({ line: draftLine || null, confirmed: confirmedOf(stored?.confirmed), pay: draftPay, wallet: stored?.wallet === true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the draft arrives
  }, [draftLine, draftPay?.method, draftPay?.option]);
  /** PR 120: he picked a payment method (or a wallet or card inside it). */
  const choosePay = (pay: PaymentChoice) => {
    void requote({ pay });
    saveDraft({ pay });
  };
  /** PR 118: he answered "Where is this address?". */
  const pick = (bandId: string, areaId: string | null) => {
    const d = view.delivery;
    // "We read somewhere else now": keeping his old band means the line itself is wrong — he fixes the line.
    if (d.state === 'ask' && d.reason === 'changed' && bandId === asked.current.confirmed?.bandId) {
      document.getElementById('co-address')?.focus();
      return;
    }
    const confirmed = { bandId, areaId };
    void requote({ line: form.address.trim(), confirmed });
    saveDraft({ confirmed });
  };
  /** PR 118: "change" takes back his own answer (ask again); a read from the line sends him back to the address. */
  const changeBand = () => {
    if (view.delivery.state === 'found' && view.delivery.via === 'choice') {
      void requote({ confirmed: null });
      saveDraft({ confirmed: null });
      return;
    }
    document.getElementById('co-address')?.focus();
  };
  const hasAddress = form.address.trim().length >= limits.addressMin;
  const check = checkForm(form, limits, fields);
  const w = (k: string, vars: Record<string, string | number> = {}) => fill(words[k] ?? k, vars);
  const m = (minor: number) => formatMoney(minor, money.currency, money.lang, money.bnDigits);
  const n = (x: number) => formatNumber(x, money.lang, money.bnDigits);
  const [sumOpen, setSumOpen] = useState(false);
  const t = view.totals;
  const saved = t.youSaveMinor;
  const amount = m(t.dueMinor) + (t.known ? '' : ` ${w('sum.plusDelivery')}`);

  const summary = (
    <>
      <div className="h3" style={{ marginBottom: 6 }}>
        {w('sum.title')} · <span className="co-cnt" data-testid="co-count">{w(view.count === 1 ? 'sum.one' : 'sum.many', { n: n(view.count) })}</span>
      </div>
      {lines}
      <div className="co-rows">
        <div className="co-r">
          <span>{w('sum.subtotal')}</span>
          <span>{m(view.subtotalMinor)}</span>
        </div>
        {view.offers.map((o) => (
          <div key={o.ruleKey} className="co-r disc" data-testid="co-offer-row">
            <span>{(money.lang === 'bn' ? o.label.bn || o.label.en : o.label.en) || w('sum.offer')}</span>
            <span>−{m(o.amountMinor)}</span>
          </div>
        ))}
        {t.walletMinor > 0 ? (
          <div className="co-r disc" data-testid="co-sum-wallet">
            <span>{w('wallet.row')}</span>
            <span>−{m(t.walletMinor)}</span>
          </div>
        ) : null}
        {t.rewardMinor > 0 ? (
          <div className="co-r disc" data-testid="co-reward-row">
            <span>{w('sum.reward')}</span>
            <span>−{m(t.rewardMinor)}</span>
          </div>
        ) : null}
        <div className="co-r">
          <span>{w('sum.delivery')}</span>
          {t.deliveryMinor === 0 ? (
            <span className="bg-freeb" data-testid="co-sum-free">
              <Icon name="check" size={13} />
              {w('sum.free')}
            </span>
          ) : t.deliveryMinor === null ? (
            <span className="muted" data-testid="co-sum-delivery-later">
              {w(view.charge.state === 'not-set' ? 'sum.onCall' : 'sum.after')}
            </span>
          ) : (
            <span data-testid="co-sum-delivery">{m(t.deliveryMinor)}</span>
          )}
        </div>
      </div>
      <div className="co-tot">
        <span>{w('sum.total')}</span>
        <span className="co-totv">
          <span className="price" data-testid="co-total">
            {m(t.dueMinor)}
          </span>
          {t.known ? null : <span className="xs muted"> {w('sum.plusDelivery')}</span>}
        </span>
      </div>
      {saved > 0 ? (
        <span className="co-was">
          <span className="strike">{m(t.regularMinor)}</span>
          <span className="co-saved">{w('sum.youSave', { amount: m(saved) })}</span>
        </span>
      ) : null}
    </>
  );

  const confirm = (
    <button type="submit" className="btn btn-primary btn-block co-confirm" data-testid="co-confirm">
      <Icon name="lock" size={18} />
      {w('confirm')}
      <span className="co-amt">· {amount}</span>
    </button>
  );

  return (
    <form id="co-form" noValidate data-testid="co-form" onSubmit={(e) => e.preventDefault()} onKeyDown={nextOnEnter} data-ready={check.ok ? '1' : '0'}>
      {wa ? (
        <div className="co-help">
          <div className="container row between" style={{ gap: 12 }}>
            <span className="co-helpt">
              <span className="co-hl">{w('help.long')}</span>
              <span className="co-hs">{w('help.short')}</span>
            </span>
            <a className="wa-btn wa-real co-wa" href={wa} target="_blank" rel="noopener" data-wa-page="">
              <WaGlyph size={18} />
              <span className="wa-lbl">
                <b>{w('help.wa')}</b> <span className="co-wa-s">{w('help.us')}</span>
              </span>
            </a>
          </div>
        </div>
      ) : null}
      <div className={`co-msum${sumOpen ? ' open' : ''}`}>
        <button type="button" className="co-msum-btn" aria-expanded={sumOpen} aria-controls="co-sum-m" onClick={() => setSumOpen(!sumOpen)} data-testid="co-msum">
          <span className="row" style={{ gap: 8 }}>
            <Icon name="bag" size={18} />
            <span>{w(sumOpen ? 'sum.hide' : 'sum.show')}</span>
            <span className="co-msum-chev">
              <Icon name={sumOpen ? 'up' : 'down'} size={14} />
            </span>
          </span>
          <span className="co-msum-amt">
            <span className="price" id="co-msum-total">
              {m(t.dueMinor)}
            </span>
            {saved > 0 ? (
              <span className="co-msum-was">
                <span className="strike">{m(t.regularMinor)}</span>
                <span className="co-msum-save">−{m(saved)}</span>
              </span>
            ) : null}
          </span>
        </button>
        {sumOpen ? (
          <div className="co-msum-bd" id="co-sum-m">
            {summary}
            <button type="button" className="co-msum-close" onClick={() => setSumOpen(false)}>
              <Icon name="up" size={14} />
              {w('sum.close')}
            </button>
          </div>
        ) : null}
      </div>
      {sumOpen ? <div className="co-sumback" aria-hidden="true" onClick={() => setSumOpen(false)} /> : null}
      <div className="container co-wrap co-lay-classic">
        <div className="split-side">
          <div className="stack s16" style={{ minWidth: 0 }}>
            <h1 className="h1 co-donly">{w('title')}</h1>
            <section className="card co-sec" data-testid="co-details">
              <div className="co-hd">
                <span className="co-num">{n(1)}</span>
                <h2 className="h2">{w('heading')}</h2>
              </div>
              <div className="stack s16 mt16">
                <DetailsFields
                  fields={fields}
                  form={form}
                  onChange={change}
                  phoneChecked={phoneChecked}
                  onPhoneBlur={() => setPhoneChecked(true)}
                  onAddressBlur={() => settle.blur()}
                  addressMax={addressMax}
                  w={w}
                  n={n}
                />
              </div>
            </section>
            <section className="card co-sec" data-testid="co-delivery">
              <div className="co-hd">
                <span className="co-num">{n(2)}</span>
                <h2 className="h2">{w('delivery')}</h2>
              </div>
              <DeliveryStep
                delivery={view.delivery}
                charge={view.charge}
                rates={view.rates}
                freeGapMinor={view.freeGapMinor}
                reading={reading || form.address.trim() !== readLine}
                hasAddress={hasAddress}
                lang={money.lang}
                w={w}
                m={m}
                n={n}
                onPick={(band, areaId) => pick(band.id, areaId)}
                onChange={changeBand}
              />
            </section>
            <PaymentStep pay={view.pay} due={amount} open={payOpens(form.address)} covered={t.known && t.walletMinor > 0 && t.dueMinor === 0} w={w} m={m} n={n} onChoose={choosePay} wa={wa} />
            <OffersCard
              wallet={view.wallet}
              w={w}
              m={m}
              onToggle={(on) => {
                void requote({ wallet: on });
                saveDraft({ wallet: on });
              }}
            />
          </div>
          <aside className="co-side">
            <div className="co-float">
              <div className="card p20">
                <div id="co-sum-d">{summary}</div>
                <div className="mt16">{confirm}</div>
                <div className="row wrap xs muted mt12" style={{ justifyContent: 'center', gap: '6px 14px' }}>
                  <span className="row" style={{ gap: 5 }}>
                    <Icon name="swap" size={14} />
                    {w('trust.exchange')}
                  </span>
                  <span className="row" style={{ gap: 5 }}>
                    <Icon name="lock" size={14} />
                    {w('trust.secure')}
                  </span>
                </div>
              </div>
              {wa ? (
                <a className="co-sidehelp" href={wa} target="_blank" rel="noopener">
                  <WaGlyph size={19} />
                  <span className="co-sh-t">
                    <span className="co-sh-q">{w('help.q')}</span> <b>{w('help.a')}</b>
                  </span>
                  <Icon name="right" size={15} />
                  <i className="co-flit" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
      <div className="mbar dm-hide co-mbar">{confirm}</div>
    </form>
  );
}
