'use client';
// PR 605 (CN-014 h, CN-020 (2)) — "Sending a gift": the card the checkout shows only when it was opened as a gift
// ("Send as a gift" in the bag) and the owner has gift mode on. The sender writes his own name and a contact for updates
// (a phone of any country or an e-mail); a gift note and a "deliver on or after" date when the owner allows them; and
// "Hide prices on the invoice", ticked as the owner set it. The details below it become the RECEIVER's. How the gift is
// paid ahead is the server's answer (`view.gift`): the whole amount (no Cash on Delivery) or a part (said here).
import type { GiftField } from '@extas/checkout/pure';
import { Icon } from '../Icon';

export interface GiftForm {
  senderName: string;
  senderContact: string;
  note: string;
  deliverAfter: string;
  hidePrices: boolean;
}

export interface GiftConfig {
  /** The longest gift note (0: no note box). */
  noteMax: number;
  /** How far ahead "deliver on or after" may be (0: no date box), and the dates that gives. */
  maxDays: number;
  window: { min: string; max: string } | null;
  hidePricesDefault: boolean;
  /** Today in the store's time zone (YYYY-MM-DD), for the page's own check. */
  today: string;
  /** The checkout that is not a gift. */
  plainHref: string;
}

export interface GiftCardProps {
  cfg: GiftConfig;
  value: GiftForm;
  onChange: (patch: Partial<GiftForm>) => void;
  /** The field a refused Confirm points at. */
  asking: GiftField | null;
  /** The advance line under the card (already in words), or null. */
  advance: string | null;
  w: (key: string, vars?: Record<string, string | number>) => string;
}

export function GiftCard({ cfg, value, onChange, asking, advance, w }: GiftCardProps) {
  const ask = (f: GiftField) =>
    asking === f ? (
      <div className="co-askmsg" role="alert" id={`co-err-${f}`} data-testid={`co-ask-co-${f}`}>
        <Icon name="info" size={15} />
        <span>
          <b>{w(`gift.ask.${f}`)}</b>
        </span>
      </div>
    ) : null;
  const box = (f: GiftField, inner: React.ReactNode) => (
    <div className={`co-f${asking === f ? ' ask' : ''}`} data-field={`co-${f}`}>
      {inner}
      {ask(f)}
    </div>
  );
  return (
    <section className="card co-sec co-gift" data-testid="co-gift">
      <div className="co-hd">
        <span className="co-num co-gift-ic">
          <Icon name="gift" size={16} />
        </span>
        <h2 className="h2">{w('gift.title')}</h2>
      </div>
      <p className="small text2 mt8">{w('gift.sub')}</p>
      <div className="stack s16 mt16">
        {box(
          'senderName',
          <>
            <label className="label" htmlFor="co-senderName">
              {w('gift.from')}
            </label>
            <input
              id="co-senderName"
              className="input"
              value={value.senderName}
              autoComplete="name"
              placeholder={w('gift.fromPh')}
              maxLength={120}
              aria-invalid={asking === 'senderName' || undefined}
              onChange={(e) => onChange({ senderName: e.target.value })}
              data-testid="co-gift-from"
            />
          </>,
        )}
        {box(
          'senderContact',
          <>
            <label className="label" htmlFor="co-senderContact">
              {w('gift.contact')}
            </label>
            <input
              id="co-senderContact"
              className="input"
              value={value.senderContact}
              inputMode="email"
              autoComplete="email"
              maxLength={120}
              aria-describedby="co-gift-contact-hint"
              aria-invalid={asking === 'senderContact' || undefined}
              onChange={(e) => onChange({ senderContact: e.target.value })}
              data-testid="co-gift-contact"
            />
            <span className="xs muted co-gift-hint" id="co-gift-contact-hint">
              {w('gift.contactHint')}
            </span>
          </>,
        )}
        {cfg.noteMax > 0
          ? box(
              'note',
              <>
                <label className="label" htmlFor="co-note-gift">
                  {w('gift.note')}
                </label>
                <textarea
                  id="co-note-gift"
                  className="input co-gift-note"
                  rows={2}
                  value={value.note}
                  maxLength={cfg.noteMax}
                  placeholder={w('gift.notePh')}
                  onChange={(e) => onChange({ note: e.target.value })}
                  data-testid="co-gift-note"
                />
              </>,
            )
          : null}
        {cfg.window
          ? box(
              'deliverAfter',
              <>
                <label className="label" htmlFor="co-deliverAfter">
                  {w('gift.date')}
                </label>
                <input
                  id="co-deliverAfter"
                  type="date"
                  className="input co-gift-date"
                  value={value.deliverAfter}
                  min={cfg.window.min}
                  max={cfg.window.max}
                  aria-describedby="co-gift-date-hint"
                  onChange={(e) => onChange({ deliverAfter: e.target.value })}
                  data-testid="co-gift-date"
                />
                <span className="xs muted co-gift-hint" id="co-gift-date-hint">
                  {w('gift.dateHint')}
                </span>
              </>,
            )
          : null}
        <label className="co-gift-hide" data-testid="co-gift-hide">
          <input type="checkbox" checked={value.hidePrices} onChange={(e) => onChange({ hidePrices: e.target.checked })} />
          <span>{w('gift.hide')}</span>
        </label>
      </div>
      {advance ? (
        <p className="co-fdays" data-testid="co-gift-advance">
          <Icon name="info" size={14} />
          <span>{advance}</span>
        </p>
      ) : null}
      <a className="co-gift-plain small" href={cfg.plainHref} data-testid="co-gift-plain">
        {w('gift.notGift')}
      </a>
    </section>
  );
}
