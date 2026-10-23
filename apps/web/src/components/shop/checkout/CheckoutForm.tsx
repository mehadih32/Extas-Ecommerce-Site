'use client';
// PR 115 — the checkout page's client part (demo 51-checkout.js co_render): the "Need help? WhatsApp us" line, the
// phone's "Show order summary" bar that opens the summary over the page (a tap outside closes it), the three steps
// (Delivery details, Delivery, Payment), the computer's side summary with Confirm, and the phone's sticky Confirm bar.
// Every word comes from the shop dictionary (`words`, resolved on the server); every amount from the server's quote.
// PR 117: the finished address line is read by the server's gazetteer (a pause or leaving the box, never mid-typing)
// and the page shows the checkout the server priced for it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { checkForm, type CheckoutView, type DetailsForm, type Field, type FormLimits } from '@extas/checkout/pure';
import { fill } from '@/lib/shop/dict';
import { formatMoney, formatNumber, type ShopLang } from '@/lib/shop/lang';
import { Icon, WaGlyph } from '../Icon';
import { DeliveryStep } from './DeliveryStep';
import { DetailsFields } from './DetailsFields';
import { nextOnEnter, saveDraft, useDraft } from './draft';
import { fetchQuote, latest, useSettle } from './quote-client';

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
  const seq = useRef(latest());
  const lineRead = useRef<string | null>(null);
  /** Prices the checkout again for what the customer chose; only the newest answer is drawn. */
  const requote = async (line: string | null) => {
    const k = seq.current.next();
    lineRead.current = line;
    setReading(true);
    const next = await fetchQuote({ lang: money.lang, address: line ? { line } : null });
    if (!seq.current.isLatest(k)) return;
    setReading(false);
    if (next) setView(next);
  };
  const settle = useSettle({ ...timing, onSettle: (line) => void requote(line) });
  const [edited, setEdited] = useState<DetailsForm | null>(null);
  // Typed details survive a reload or a pull-to-refresh: kept in this tab only (sessionStorage), never sent from here.
  const form: DetailsForm = edited ?? stored?.form ?? EMPTY_FORM;
  const [phoneChecked, setPhoneChecked] = useState(false);
  const change = (f: Field, v: string) => {
    const next = { ...form, [f]: v };
    setEdited(next);
    saveDraft({ form: next });
    if (f === 'address') settle.input(v);
  };
  // An address that comes back from this tab's draft is already finished: it is read once, at once.
  const draftLine = stored?.form.address.trim() ?? '';
  useEffect(() => {
    if (draftLine && lineRead.current === null) void requote(draftLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the draft arrives
  }, [draftLine]);
  const hasAddress = form.address.trim().length >= limits.addressMin;
  const check = checkForm(form, limits, fields);
  const w = (k: string, vars: Record<string, string | number> = {}) => fill(words[k] ?? k, vars);
  const m = (minor: number) => formatMoney(minor, money.currency, money.lang, money.bnDigits);
  const n = (x: number) => formatNumber(x, money.lang, money.bnDigits);
  const [sumOpen, setSumOpen] = useState(false);
  const t = view.totals;
  const saved = t.youSaveMinor;
  const amount = m(t.totalMinor) + (t.known ? '' : ` ${w('sum.plusDelivery')}`);

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
        <div className="co-r">
          <span>{w('sum.delivery')}</span>
          {t.deliveryMinor === 0 ? (
            <span className="bg-freeb" data-testid="co-sum-free">
              <Icon name="check" size={13} />
              {w('sum.free')}
            </span>
          ) : t.deliveryMinor === null ? (
            <span className="muted">{w('sum.after')}</span>
          ) : (
            <span>{m(t.deliveryMinor)}</span>
          )}
        </div>
      </div>
      <div className="co-tot">
        <span>{w('sum.total')}</span>
        <span className="co-totv">
          <span className="price" data-testid="co-total">
            {m(t.totalMinor)}
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
              {m(t.totalMinor)}
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
              <DeliveryStep delivery={view.delivery} reading={reading} hasAddress={hasAddress} lang={money.lang} w={w} />
            </section>
            <section className="card co-sec co-paysec" data-testid="co-pay">
              <div className="co-hd">
                <span className="co-num">{n(3)}</span>
                <h2 className="h2">{w('payment')}</h2>
              </div>
            </section>
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
