'use client';
// PR 117/118 — step 2, "Delivery" (demo 51-checkout.js co_delivery): before an address it says the charge appears once the
// address is written; while the finished line is read, that it is being read; then the band the gazetteer found, with
// the place it read ("Mirpur 12 · Dhaka"), so the customer confirms it by sight (SIM-F-003 growth idea).
// PR 118 — a line the gazetteer cannot settle is a question, never a guess: "Where is this address?" with one button per
// band (its charge and hours when the owner set them); his answer is kept until the address changes, and "change"
// takes it back.
import type { BandOut, DeliveryView } from '@extas/checkout/pure';
import { hoursOf, named, placeLine } from '@/lib/shop/checkout-model';
import type { ShopLang } from '@/lib/shop/lang';
import { Icon } from '../Icon';

export interface DeliveryStepProps {
  delivery: DeliveryView;
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
}

export function DeliveryStep({ delivery, reading, hasAddress, lang, w, m, n, onPick, onChange }: DeliveryStepProps) {
  if (delivery.state === 'found' && !reading) {
    const where = placeLine(lang, delivery.place);
    return (
      <div className="co-zone mt16" data-testid="co-zone-box">
        <Icon name="truck" size={22} />
        <div className="grow">
          <div className="h3" data-testid="co-zone">
            {named(lang, delivery.band.nameEn, delivery.band.nameBn)}
          </div>
          <div className="small text2">
            {where ? <span data-testid="co-zone-place">{where}</span> : null}{' '}
            <button type="button" className="link co-zchg" onClick={onChange} data-testid="co-zone-change">
              {w('del.change')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (delivery.state === 'ask' && !reading) {
    const two = delivery.reason === 'two-places' && delivery.options.length === 2 && delivery.options.every((o) => o.places.length > 0);
    return (
      <div data-testid="co-zone-ask">
        <p className="co-zask">{w('del.ask')}</p>
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
  return (
    <p className="co-fdays" data-testid="co-del-wait">
      <Icon name="info" size={14} />
      <span>{w(hasAddress ? 'del.reading' : 'del.write')}</span>
    </p>
  );
}
