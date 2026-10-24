'use client';
// PR 115 — the checkout page's client part (demo 51-checkout.js co_render): the "Need help? WhatsApp us" line, the
// phone's "Show order summary" bar that opens the summary over the page (a tap outside closes it), the three steps
// (Delivery details, Delivery, Payment), the computer's side summary with Confirm, and the phone's sticky Confirm bar.
// Every word comes from the shop dictionary (`words`, resolved on the server); every amount from the server's quote.
// PR 117: the finished address line is read by the server's gazetteer (a pause or leaving the box, never mid-typing)
// and the page shows the checkout the server priced for it. PR 118: the band he picks when asked. PR 119: the delivery
// charge in the summary and the total — the server's figure, or "free", or "+ delivery" while it is not known.
// PR 120: the payment step; the choice is kept in the tab's draft and priced by the server (the prepaid reward).
// PR 122: "Your offers" with the wallet; the total and Confirm show what is left to pay. PR 123: the marketing ticks.
// PR 124: Confirm's states — it asks inside the unfinished field (or waits switched off, the owner's other style).
// PR 125: Confirm places the order — with the order key kept in this tab's draft, so a retry after a lost answer or a
// second press is the same order — and goes on to the payment or the thank-you page; a refusal says why in the page's
// words (money that moved shows the new checkout first). The delivery note card; with the owner's switch on, what he
// typed is kept for the team's follow-up a moment after he stops typing (SIM-F-026).
// PR 137 (Blueprint C6.4, C6.5): the boxes start filled — this tab's draft first, then a signed-in customer's own
// details (`prefill`, from his account), then what this browser remembers from his last order when the owner allows
// it (`remember`); the browser's own autofill is read on the first touch even before he types. A start that only came
// from his account or this browser is not sent for the follow-up until he changes something.
// PR 565: while delivery is free none of the band machinery shows — the delivery step says only "Free home delivery",
// the address suggestions carry no charge, and an unsettled band is never asked.
// PR 561: with the owner's silent backfill on, the phone number goes with each address read; a number that becomes
// whole (or changes) while the band is asked, or was settled from it, reads the line again. Nothing is prefilled.
// PR 605: a gift checkout (`gift`): the "Sending a gift" card above the details, which become the receiver's; every
// quote and the order say it is a gift, the gift card is checked as the server checks it, and a refused gift field is
// pointed at like any other.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { checkForm, checkGift, GIFT_FIELDS, latinDigits, phoneNormalizeBD, type CheckoutView, type DetailsForm, type Field, type FormLimits, type ConsentInput, type GiftField, type PaymentChoice } from '@extas/checkout/pure';
import { askKey, confirmedOf, payChoiceOf, payOpens, stillAsked } from '@/lib/shop/checkout-model';
import { fill } from '@/lib/shop/dict';
import { formatMoney, formatNumber, type ShopLang } from '@/lib/shop/lang';
import { Icon, WaGlyph } from '../Icon';
import { showToast } from '../toast';
import { GpsShare, type GpsConfig, type GpsPoint } from './GpsShare';
import { DeliveryStep } from './DeliveryStep';
import { DetailsFields } from './DetailsFields';
import { GiftCard, type GiftConfig, type GiftForm } from './GiftCard';
import { ConsentCard } from './ConsentCard';
import { OffersCard } from './OffersCard';
import { PaymentStep } from './PaymentStep';
import { NoteCard } from './NoteCard';
import { clearDraft, forgetDetails, newOrderKey, nextOnEnter, rememberDetails, saveDraft, useDraft, useRemembered } from './draft';
import { DRAFT_URL, fetchQuote, latest, ORDERS_URL, postJson, useSettle, type Choices, type PlaceAnswer } from './quote-client';

const EMPTY_FORM: DetailsForm = { name: '', phone: '', address: '' };
const FIELDS: readonly Field[] = ['name', 'phone', 'address'];
/** A form with something in it, else null (a draft that only keeps the payment has empty boxes). */
const filled = (f: DetailsForm | null | undefined): DetailsForm | null => (f && (f.name || f.phone || f.address) ? f : null);

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
  /** PR 123: the marketing ticks' starting state, or null when the owner switched them off. */
  consent: ConsentInput | null;
  /** The exchange policy and the terms. */
  links: { exchange: string; terms: string };
  /** PR 124: an unfinished form — 'ask' (the button asks inside the field) or 'disable' (`checkout.confirm.style`). */
  confirmStyle: 'ask' | 'disable';
  /** PR 125: the delivery note card and its longest note, or null when the owner switched it off. */
  note: { max: number } | null;
  /** PR 125 (SIM-F-026): keep what he typed for the team's follow-up, this long after he stops typing; null: off. */
  capture: { waitMs: number } | null;
  /** Where the bag is (an item sold out, or the bag is empty). */
  bagHref: string;
  /** Follow-up 57: the places under the address box (`delivery.suggest.*`), or null when off. */
  suggest: { minChars: number; storeId: number; words: { label: string; count: string } } | null;
  /** PR 137: a signed-in customer's own details to start with (null: signed out, or the owner switched it off). */
  prefill?: DetailsForm | null;
  /** PR 137: how many days this browser remembers his last order's details; null: never (`checkout.autofill.browserDays`). */
  remember?: { days: number } | null;
  /** PR 561: the owner's silent address backfill is on (`checkout.address.backfill`): send the phone with the address. */
  backfill?: boolean;
  /** PR 605: the checkout is a gift (opened as one, gift mode on); null: an ordinary checkout. */
  gift?: GiftConfig | null;
  /** PR 159: "Share my location" (`risk.capture.gpsButton`; never on a gift), how finely and how long it is kept; null: off. */
  gps?: GpsConfig | null;
}

const isGiftField = (f: unknown): f is GiftField => (GIFT_FIELDS as readonly unknown[]).includes(f);

export function CheckoutForm({
  view: first,
  words,
  money,
  lines,
  wa,
  fields,
  limits,
  settle: timing,
  addressMax,
  consent: consentStart,
  links,
  confirmStyle,
  note: noteCfg,
  capture,
  bagHref,
  suggest,
  prefill = null,
  remember = null,
  backfill = false,
  gift: giftCfg = null,
  gps: gpsCfg = null,
}: CheckoutFormProps) {
  const stored = useDraft();
  const rememberDays = remember?.days ?? 0;
  const kept = useRemembered(rememberDays);
  useEffect(() => {
    if (rememberDays <= 0) forgetDetails();
  }, [rememberDays]);
  const [view, setView] = useState<CheckoutView>(first);
  const [reading, setReading] = useState(false);
  /** The line the delivery step shows the answer for; while the box says something else, it says "Reading …". */
  const [readLine, setReadLine] = useState<string | null>(null);
  const seq = useRef(latest());
  /** What the page last asked the server about: the finished line and the band he chose (PR 118). */
  const asked = useRef<Choices>({ line: null, confirmed: null, pay: null, wallet: false });
  /** PR 561: the phone number as typed now (read when a quote is asked for). */
  const phoneNow = useRef('');
  /** PR 560: the name as typed now (sent with a quote only once the name and the number are both finished). */
  const nameNow = useRef('');
  /** PR 560: the name and number, once both are finished (the owner's Parameter for Checkout looks only then). */
  const detailsNow = () => {
    const name = nameNow.current.trim();
    return [...name].length >= Math.max(1, limits.nameMin) && phoneNormalizeBD(phoneNow.current).ok ? { name, phone: phoneNow.current } : null;
  };
  /** Prices the checkout again for what the customer chose; only the newest answer is drawn. */
  const requote = async (patch: Partial<Choices>) => {
    const c = { ...asked.current, ...patch };
    asked.current = c;
    const k = seq.current.next();
    setReadLine(c.line);
    setReading(true);
    const phone = backfill && phoneNormalizeBD(phoneNow.current).ok ? phoneNow.current : null;
    const next = await fetchQuote({
      lang: money.lang,
      address: c.line ? { line: c.line, confirmed: c.confirmed, ...(phone ? { phone } : {}) } : null,
      payment: c.pay,
      useWallet: c.wallet,
      ...(giftCfg ? { gift: true } : {}),
      details: detailsNow(),
    });
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
  const start = filled(stored?.form) ?? filled(prefill) ?? kept;
  const form: DetailsForm = edited ?? start ?? EMPTY_FORM;
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
  const draftLine = start?.address.trim() ?? '';
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
  // PR 123: the ticks as he left them in this tab, else their starting state.
  const [consentEdited, setConsent] = useState<ConsentInput | null>(null);
  const keptConsent = stored?.consent as Partial<ConsentInput> | undefined;
  const consent: ConsentInput | null = consentStart
    ? (consentEdited ?? (keptConsent && typeof keptConsent.sms === 'boolean' && typeof keptConsent.whatsapp === 'boolean' ? { sms: keptConsent.sms, whatsapp: keptConsent.whatsapp } : consentStart))
    : null;
  // PR 125: the delivery note, kept in the tab's draft like the rest.
  const [noteEdited, setNote] = useState<string | null>(null);
  const note = noteCfg ? (noteEdited ?? (typeof stored?.note === 'string' ? stored.note : '')) : '';
  // PR 605: the gift card, kept in the tab's draft like the rest
  const [giftEdited, setGift] = useState<GiftForm | null>(null);
  const keptGift = (stored?.gift ?? null) as Partial<GiftForm> | null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const giftForm: GiftForm = giftEdited ?? {
    senderName: str(keptGift?.senderName),
    senderContact: str(keptGift?.senderContact),
    note: str(keptGift?.note),
    deliverAfter: str(keptGift?.deliverAfter),
    hidePrices: typeof keptGift?.hidePrices === 'boolean' ? keptGift.hidePrices : (giftCfg?.hidePricesDefault ?? true),
  };
  const giftCheck = giftCfg
    ? checkGift(giftForm, { nameMin: limits.nameMin, noteMax: giftCfg.noteMax, maxDays: giftCfg.maxDays }, giftCfg.today, giftCfg.hidePricesDefault)
    : null;
  const [giftAsk, setGiftAsk] = useState<GiftField | null>(null);
  const giftAsking = giftAsk && giftCheck && !giftCheck.ok && giftCheck.field === giftAsk ? giftAsk : null;
  // SIM-F-026: with the owner's switch on, what he typed is kept for the team a moment after he stops (a real phone only).
  const phoneOk = phoneNormalizeBD(form.phone).ok;
  useEffect(() => {
    phoneNow.current = form.phone;
  }, [form.phone]);
  useEffect(() => {
    nameNow.current = form.name;
  }, [form.name]);
  // PR 560: the name and number just got finished (or a finished one changed, or was taken back): price it again, so a
  // checkout the owner's layers flag shows its payment section on this same page
  const nameDone = [...form.name.trim()].length >= Math.max(1, limits.nameMin);
  const typedNow = phoneNormalizeBD(form.phone);
  const detailsKey = nameDone && typedNow.ok ? typedNow.e164 : null;
  const seenDetails = useRef<string | null>(null);
  useEffect(() => {
    if (seenDetails.current === detailsKey) return;
    seenDetails.current = detailsKey;
    if (!asked.current.line) return;
    void requote({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the finished details change
  }, [detailsKey]);
  // PR 561: a whole number (or another one) while the band is asked, or was settled from the old number: read again
  const typedPhone = phoneNormalizeBD(form.phone);
  const backfillKey = backfill && typedPhone.ok ? typedPhone.e164 : null;
  const seenBackfill = useRef<string | null>(null);
  useEffect(() => {
    if (seenBackfill.current === backfillKey) return;
    const before = seenBackfill.current;
    seenBackfill.current = backfillKey;
    const d = view.delivery;
    const silent = d.state === 'ask' || (d.state === 'found' && d.via === 'saved');
    if (!asked.current.line || asked.current.confirmed || !silent || (before === null && backfillKey === null)) return;
    void requote({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the whole number changes
  }, [backfillKey]);
  const capturePay = stored?.pay ? view.pay.chosen : null;
  const touched = edited !== null || filled(stored?.form) !== null;
  const captureKey = capture && phoneOk && touched ? JSON.stringify([form, note, capturePay]) : null;
  useEffect(() => {
    if (!capture || !captureKey) return;
    const step = capturePay ? 'payment' : form.address.trim() ? 'delivery' : 'details';
    const timer = setTimeout(() => void postJson(DRAFT_URL, { form, payment: capturePay, note: note || null, step }), capture.waitMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key holds everything that is sent
  }, [captureKey]);
  const hasAddress = form.address.trim().length >= limits.addressMin;
  const check = checkForm(form, limits, fields);
  const w = (k: string, vars: Record<string, string | number> = {}) => fill(words[k] ?? k, vars);
  const m = (minor: number) => formatMoney(minor, money.currency, money.lang, money.bnDigits);
  const n = (x: number) => formatNumber(x, money.lang, money.bnDigits);
  const [sumOpen, setSumOpen] = useState(false);
  // PR 124 (demo #42): a refused Confirm points at the first unfinished field — lit up, scrolled to, focused, and a
  // Bengali line inside its own box says what to write; the marks go as each field is fixed.
  const [tried, setTried] = useState(false);
  const [ask, setAsk] = useState<Field | null>(null);
  const asking = stillAsked(ask, check);
  const invalid: Partial<Record<Field, string>> = tried && !check.ok ? Object.fromEntries(Object.keys(check.all).map((f) => [f, '1'])) : {};
  const askLine = (f: Field) => {
    const k = askKey(f, check);
    return (
      <div className="co-askmsg" role="alert" id={`co-err-${f}`} data-testid={`co-ask-co-${f}`}>
        <Icon name="info" size={15} />
        <span>
          <b lang="bn">{w(`askBn.${k}`)}</b>
          {money.lang === 'bn' ? null : <span>{w(`ask.${k}`)}</span>}
        </span>
      </div>
    );
  };
  const wrapField = (f: Field, inner: ReactNode) => (
    <div className={`co-f${asking === f ? ' ask' : ''}`} data-field={`co-${f}`}>
      {inner}
      {asking === f ? (
        askLine(f)
      ) : invalid[f] ? (
        <span className="sr" id={`co-err-${f}`}>
          {w(`ask.${askKey(f, check)}`)}
        </span>
      ) : null}
    </div>
  );
  const covered = view.totals.known && view.totals.walletMinor > 0 && view.totals.dueMinor === 0;
  // PR 125: placing the order. The key is made once and kept in the tab until the order is in.
  const [placing, setPlacing] = useState(false);
  // PR 159: the point he chose to share (only after his tap), sent with the order
  const [point, setPoint] = useState<GpsPoint | null>(null);
  const askField = (formEl: HTMLFormElement, field: Field | GiftField) => {
    setTried(true);
    setPhoneChecked(true);
    if (isGiftField(field)) setGiftAsk(field);
    else setAsk(field);
    const box = formEl.querySelector(`[data-field="co-${field}"]`);
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = document.getElementById(`co-${field}`);
    setTimeout(() => input?.focus({ preventScroll: true }), 240); // hardcode-ok: the demo's wait for the scroll to start before focus
  };
  const place = async (formEl: HTMLFormElement) => {
    if (placing) return;
    setPlacing(true);
    const key = typeof stored?.orderKey === 'string' ? stored.orderKey : newOrderKey();
    saveDraft({ orderKey: key });
    const r = await postJson<PlaceAnswer>(ORDERS_URL, {
      idempotencyKey: key,
      lang: money.lang,
      form,
      confirmed: asked.current.confirmed,
      payment: view.pay.chosen,
      useWallet: asked.current.wallet,
      consent,
      note: note || null,
      ...(giftCfg ? { gift: { ...giftForm, note: giftForm.note || null, deliverAfter: giftForm.deliverAfter || null } } : {}),
      ...(gpsCfg && point ? { gps: point } : {}),
      fingerprint: view.fingerprint,
    });
    const a = r.data;
    if (a?.ok && a.next) {
      if (rememberDays > 0) rememberDetails(form, rememberDays);
      clearDraft();
      window.location.assign(a.next);
      return; // the button stays "Placing your order…" until the next page opens
    }
    setPlacing(false);
    if (!a) return showToast(formEl, w('err.network'));
    if (a.error === 'PRICE_CHANGED') {
      if (a.view) setView(a.view);
      else void requote({});
      return showToast(formEl, w('err.changed'));
    }
    if (a.error === 'FORM' && isGiftField(a.field)) {
      askField(formEl, a.field);
      return showToast(formEl, w(`gift.ask.${a.field}`));
    }
    if (a.error === 'FORM' && a.field) {
      askField(formEl, a.field);
      return showToast(formEl, w(`askBn.${a.field === 'phone' && a.problem !== 'empty' ? 'phoneBad' : a.field}`));
    }
    if (a.error === 'NO_PAYMENT') return showToast(formEl, w('need.pay'));
    if (a.error === 'OUT_OF_STOCK' || a.error === 'EMPTY' || a.error === 'CART_NOT_OPEN') {
      showToast(formEl, w(a.error === 'OUT_OF_STOCK' ? 'err.stock' : 'err.empty'));
      window.location.assign(bagHref);
      return;
    }
    showToast(formEl, w('err.other'));
  };
  // C6.4: a browser that filled the boxes from its own saved details shows them to the page on the first touch; they
  // are taken as if typed (kept in the draft, priced, and kept for the follow-up when the owner's switch is on).
  const readAutofill = () => {
    for (const f of FIELDS) {
      const el = document.getElementById(`co-${f}`) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && el.value && el.value !== form[f]) change(f, f === 'phone' ? latinDigits(el.value) : el.value);
    }
  };
  const submit = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const by = (ev.nativeEvent as SubmitEvent).submitter;
    if (by && !by.classList.contains('co-confirm')) return;
    const formEl = ev.currentTarget;
    if (!check.ok) {
      askField(formEl, check.field);
      showToast(formEl, w(`askBn.${askKey(check.field, check)}`));
      return;
    }
    if (giftCheck && !giftCheck.ok) {
      askField(formEl, giftCheck.field);
      showToast(formEl, w(`gift.ask.${giftCheck.field}`));
      return;
    }
    if (!view.pay.chosen && !covered) {
      showToast(formEl, w('need.pay'));
      return;
    }
    void place(formEl);
  };
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

  // 'disable' (demo 42(a)): the button waits switched off and says what is missing; 'ask' never switches it off.
  const off = confirmStyle === 'disable' && !check.ok;
  const confirm = (
    <button type="submit" className={`btn btn-primary btn-block co-confirm${off ? ' co-need-on' : ''}`} disabled={off || placing} aria-busy={placing} data-testid="co-confirm">
      {placing ? (
        <>
          <Icon name="lock" size={18} />
          {w('placing')}
        </>
      ) : off && !check.ok ? (
        <span className="co-need">
          <b>{w('need.add', { what: w(`what.${check.field}`) })}</b>
          <span>
            <Icon name="lock" size={13} /> {w('need.then')} · {amount}
          </span>
        </span>
      ) : (
        <>
          <Icon name="lock" size={18} />
          {w('confirm')}
          <span className="co-amt">· {amount}</span>
        </>
      )}
    </button>
  );

  return (
    <form id="co-form" noValidate data-testid="co-form" onSubmit={submit} onKeyDown={nextOnEnter} onFocusCapture={readAutofill} data-ready={check.ok ? '1' : '0'}>
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
            {giftCfg ? (
              <GiftCard
                cfg={giftCfg}
                value={giftForm}
                asking={giftAsking}
                advance={view.gift?.advance === 'full' ? w('gift.advanceFull') : view.gift?.advance === 'part' && view.gift.partMinor ? w('gift.advancePart', { amount: m(view.gift.partMinor) }) : null}
                w={w}
                onChange={(patch) => {
                  const next = { ...giftForm, ...patch };
                  setGift(next);
                  saveDraft({ gift: next });
                }}
              />
            ) : null}
            <section className="card co-sec" data-testid="co-details">
              <div className="co-hd">
                <span className="co-num">{n(1)}</span>
                <h2 className="h2">{w(giftCfg ? 'gift.receiver' : 'heading')}</h2>
              </div>
              {giftCfg ? <p className="small text2 mt8">{w('gift.receiverSub')}</p> : null}
              <div className="stack s16 mt16">
                <DetailsFields
                  fields={fields}
                  form={form}
                  onChange={change}
                  phoneChecked={phoneChecked}
                  onPhoneBlur={() => setPhoneChecked(true)}
                  onAddressBlur={() => settle.blur()}
                  addressMax={addressMax}
                  suggest={suggest ? { ...suggest, lang: money.lang, money: m, n, free: view.charge.state === 'free' } : null}
                  onAddressPick={(line) => {
                    // a picked place is a finished line: it is read at once, not after the pause
                    change('address', line);
                    settle.blur();
                  }}
                  w={w}
                  n={n}
                  wrap={wrapField}
                  invalid={invalid}
                />
                {gpsCfg ? <GpsShare cfg={gpsCfg} value={point} onChange={setPoint} w={w} /> : null}
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
            <PaymentStep pay={view.pay} due={view.advance ? m(view.advance.amountMinor) : amount} advance={view.advance} restPlus={t.known ? '' : ` ${w('sum.plusDelivery')}`} open={payOpens(form.address)} covered={covered} w={w} m={m} n={n} onChoose={choosePay} wa={wa} />
            <OffersCard
              wallet={view.wallet}
              w={w}
              m={m}
              onToggle={(on) => {
                void requote({ wallet: on });
                saveDraft({ wallet: on });
              }}
            />
            {noteCfg ? (
              <NoteCard
                note={note}
                max={noteCfg.max}
                w={w}
                onChange={(v) => {
                  setNote(v);
                  saveDraft({ note: v });
                }}
              />
            ) : null}
            <ConsentCard
              consent={consent}
              onChange={(c) => {
                setConsent(c);
                saveDraft({ consent: c });
              }}
              w={w}
              links={links}
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
