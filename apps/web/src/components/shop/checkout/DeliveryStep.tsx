'use client';
// PR 117/118/119 — step 2, "Delivery" (demo 51-checkout.js co_delivery).
// - Free (a campaign, the threshold, free-delivery products — the rules engine decides): one box that says "Free home
//   delivery" and why, and not one figure anywhere on the step (demo #36); then the delivery promise in hours.
// - Before a settled address: the store's rates ("Dhaka City ৳X · Outside Dhaka ৳Y", only bands the owner priced), what
//   happens next, and how much more makes delivery free.
// - PR 118: a line the gazetteer cannot settle is a question, never a guess: "Where is this address?" with one button
//   per band (its charge and hours when set); his answer is kept until the address changes, and "change" takes it back.
// - Found: the band, the place it read ("Mirpur 12 · Dhaka", so he confirms it by sight — SIM-F-003), the promise for
//   that band, and its charge; a band with no charge yet says the charge is confirmed on the call.
// - PR 193: `eta` — the owner's lines that replace the hours promise: "ships from …" during the shop's holiday, "may
//   arrive after Eid" for a place past its Eid order-by date (SIM-F-019: never the hours then). Empty: the usual promise.
import type { BandOut, DeliveryCharge, DeliveryView } from '@extas/checkout/pure';
import { anyBandHours, hoursOf, named, placeLine } from '@/lib/shop/checkout-model';
import type { ShopLang } from '@/lib/shop/lang';
import { Icon } from '../Icon';

export interface DeliveryStepProps {
  delivery: DeliveryView;
  charge: DeliveryCharge;
  /** The priced city and outside bands (the rates line). */
  rates: BandOut[];
  /** How much more makes delivery free (null: no threshold, or free already). */
  freeGapMinor: number | null;
  /** A finished line is being read right now. */
  reading: boolean;
  /** The address box holds a whole address (its shortest length): the page says it is reading it. */
  hasAddress: boolean;
  lang: ShopLang;
  w: (key: string, vars?: Record<string, string | number>) => string;
  /** Money and numbers in the page's digits. */
  m: (minor: number) => string;
  n: (x: number) => string;
  /** The customer answered the question: this band (and this place, when the button stood for one). */
  onPick: (band: BandOut, areaId: string | null) => void;
  /** "change": take back his answer (ask again), or — for a read from the line — go back to the address. */
  onChange: () => void;
  /** PR 193: the lines in place of the hours promise (the holiday, the Eid date of this place); empty: the usual one. */
  eta?: string[];
}

export function DeliveryStep({ delivery, charge, rates, freeGapMinor, reading, hasAddress, lang, w, m, n, onPick, onChange, eta = [] }: DeliveryStepProps) {
  const found = delivery.state === 'found' && !reading ? delivery : null;
  const promiseOf = (b: Pick<BandOut, 'hoursMin' | 'hoursMax'>, key: 'del.promise' | 'del.promiseAny') => {
    // PR 193: the holiday or the Eid date speaks instead of the hours
    if (eta.length) return eta.join(' ');
    const hours = hoursOf(b, n);
    return hours ? w(key, { hours }) : null;
  };

  if (charge.state === 'free') {
    const promise = found && found.band.priced ? promiseOf(found.band, 'del.promise') : promiseOf(anyBandHours(rates), 'del.promiseAny');
    return (
      <>
        <div className="co-freebox mt12" data-testid="co-free">
          <Icon name="truck" size={24} />
          <div className="grow">
            <div className="h3">{w('del.freeTitle')}</div>
            <div className="small text2">{w(`del.free.${charge.reason}`, { amount: charge.freeOverMinor !== null ? m(charge.freeOverMinor) : '' })}</div>
          </div>
          <span className="bg-freeb">
            <Icon name="check" size={13} />
            {w('sum.free')}
          </span>
        </div>
        {promise ? (
          <div className="co-promrow">
            <p className="co-fdays co-promise" data-testid={eta.length ? 'co-eta' : 'co-promise'}>
              <Icon name="clock" size={14} />
              <span>{promise}</span>
            </p>
          </div>
        ) : null}
      </>
    );
  }

  if (found) {
    const where = placeLine(lang, found.place);
    const promise = found.band.priced || eta.length ? promiseOf(found.band, 'del.promise') : null;
    return (
      <div className="co-zone mt16" data-testid="co-zone-box">
        <Icon name="truck" size={22} />
        <div className="grow">
          <div className="h3" data-testid="co-zone">
            {named(lang, found.band.nameEn, found.band.nameBn)}
          </div>
          {where ? (
            <div className="small text2" data-testid="co-zone-place">
              {where}
            </div>
          ) : null}
          <div className="small text2">
            {charge.state === 'not-set' ? <span data-testid="co-charge-later">{w('del.notSet')}</span> : null}
            {charge.state === 'not-set' && eta.length ? ' ' : null}
            {promise && (charge.state !== 'not-set' || eta.length) ? <span data-testid={eta.length ? 'co-eta' : undefined}>{promise}</span> : null}{' '}
            <button type="button" className="link co-zchg" onClick={onChange} data-testid="co-zone-change">
              {w('del.change')}
            </button>
          </div>
        </div>
        {charge.state === 'charge' ? (
          <div className="shrink0">
            <b className="price" data-testid="co-charge">
              {m(charge.chargeMinor)}
            </b>
          </div>
        ) : null}
      </div>
    );
  }

  if (delivery.state === 'ask' && !reading) {
    const two = delivery.reason === 'two-places' && delivery.options.length === 2 && delivery.options.every((o) => o.places.length > 0);
    return (
      <div data-testid="co-zone-ask">
        <p className="co-zask">{w('del.ask')}</p>
        {eta.length ? (
          <p className="co-fdays" data-testid="co-eta">
            <Icon name="clock" size={14} />
            <span>{eta.join(' ')}</span>
          </p>
        ) : null}
        {two ? (
          <p className="co-zboth">
            <Icon name="info" size={14} />
            <span>{w('del.both', { a: placeLine(lang, delivery.options[0]!.places[0]!), b: placeLine(lang, delivery.options[1]!.places[0]!) })}</span>
          </p>
        ) : null}
        <div className={`co-zpick${delivery.options.length > 2 ? ' z3' : ''}`}>
          {delivery.options.map((o) => {
            const hours = hoursOf(o.band, n);
            const facts = [o.band.chargeMinor !== null ? m(o.band.chargeMinor) : null, hours ? w('del.hours', { hours }) : null].filter(Boolean).join(' · ');
            return (
              <button
                key={o.band.id}
                type="button"
                className="co-zbtn"
                data-testid="co-zone-pick"
                data-band={o.band.key}
                onClick={() => onPick(o.band, o.places.length === 1 ? o.places[0]!.id : null)}
              >
                <b>{named(lang, o.band.nameEn, o.band.nameBn)}</b>
                {facts ? <span>{facts}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const priced = rates.filter((b) => b.priced && b.chargeMinor !== null);
  return (
    <>
      {priced.length ? (
        <div className="co-rates" data-testid="co-rates">
          <Icon name="truck" size={16} />
          <span>
            {priced.map((b, i) => (
              <span key={b.id}>
                {i ? <span className="co-rsep">·</span> : null}
                {named(lang, b.nameEn, b.nameBn)} <b>{m(b.chargeMinor!)}</b>
              </span>
            ))}
          </span>
        </div>
      ) : null}
      <p className="co-fdays" data-testid="co-del-wait">
        <Icon name="info" size={14} />
        <span>{w(hasAddress ? 'del.reading' : 'del.write')}</span>
      </p>
      {eta.length ? (
        <p className="co-fdays" data-testid="co-eta">
          <Icon name="clock" size={14} />
          <span>{eta.join(' ')}</span>
        </p>
      ) : null}
      {freeGapMinor !== null && freeGapMinor > 0 ? (
        <p className="co-fdays" data-testid="co-free-gap">
          <Icon name="gift" size={14} />
          <span>{w('del.gap', { amount: m(freeGapMinor) })}</span>
        </p>
      ) : null}
    </>
  );
}
