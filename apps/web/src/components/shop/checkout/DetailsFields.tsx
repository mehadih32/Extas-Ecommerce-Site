'use client';
// PR 116 — "Delivery details": name, phone and address in the owner's order (`checkout.fieldOrder`), checked inline
// the way the order is checked (@extas/checkout/pure). The phone box carries a small chip on its right edge (owner Note
// 54 #9): the cleaned number said back once it is right ("We'll call 01712-345678"), a short "8/11 digits" only after
// the box is left (or after Confirm) — never on the first digit; Bengali digits become 0-9 as they are typed and what he
// typed is never rewritten. The address keeps the owner's one Bengali hint as its placeholder, in both languages.
import { Fragment, useLayoutEffect, useRef } from 'react';
import { latinDigits, phoneNormalizeBD, type DetailsForm, type Field } from '@extas/checkout/pure';
import { Icon } from '../Icon';

export interface DetailsProps {
  fields: Field[];
  form: DetailsForm;
  onChange: (field: Field, value: string) => void;
  /** The phone box was left (or Confirm was pressed): a wrong number may now say so. */
  phoneChecked: boolean;
  onPhoneBlur: () => void;
  onAddressBlur?: () => void;
  w: (key: string, vars?: Record<string, string | number>) => string;
  n: (x: number) => string;
  /** Wraps a field (PR 124 puts the "write it here" box inside it). */
  wrap?: (field: Field, inner: React.ReactNode) => React.ReactNode;
  /** The full field state for screen readers (PR 124: aria-invalid after a refused Confirm). */
  invalid?: Partial<Record<Field, string>>;
}

const PHONE_DIGITS = 11;

export function DetailsFields({ fields, form, onChange, phoneChecked, onPhoneBlur, onAddressBlur, w, n, wrap, invalid = {} }: DetailsProps) {
  const ph = phoneNormalizeBD(form.phone);
  const showWarn = !ph.ok && !ph.empty && phoneChecked;
  const chipRef = useRef<HTMLSpanElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  // The typed number never runs under the chip: the box keeps room on its right for it.
  useLayoutEffect(() => {
    const el = phoneRef.current;
    if (!el) return;
    const chip = chipRef.current;
    el.style.paddingRight = chip ? `${Math.ceil(chip.getBoundingClientRect().width) + 18}px` : '';
  });
  const shortWarn = (): string => {
    const count = ph.digits.length;
    if (count && count < PHONE_DIGITS) return w('form.phoneCount', { n: n(count) });
    if (count > PHONE_DIGITS) return w('form.phoneLong');
    return w('form.phoneCheck');
  };
  const box = (f: Field, inner: React.ReactNode) => (wrap ? wrap(f, inner) : <div className="co-f" data-field={`co-${f}`}>{inner}</div>);
  const described = (id: string, extra?: string) => [extra, invalid[id as Field] ? `co-err-${id}` : null].filter(Boolean).join(' ') || undefined;
  const F: Record<Field, React.ReactNode> = {
    name: box(
      'name',
      <>
        <label className="label" htmlFor="co-name">
          {w('form.name')}
        </label>
        <input
          id="co-name"
          name="name"
          className="input"
          enterKeyHint="next"
          autoComplete="name"
          value={form.name}
          maxLength={120}
          aria-invalid={invalid.name ? true : undefined}
          aria-describedby={described('name')}
          onChange={(e) => onChange('name', e.target.value)}
        />
      </>,
    ),
    phone: box(
      'phone',
      <>
        <label className="label" htmlFor="co-phone">
          {w('form.phone')}
        </label>
        <div className="co-inwrap">
          <input
            ref={phoneRef}
            id="co-phone"
            name="phone"
            className={`input${ph.ok ? ' ok' : showWarn ? ' warn' : ''}`}
            type="tel"
            inputMode="tel"
            enterKeyHint="next"
            autoComplete="tel"
            placeholder={w('form.phonePh')}
            value={form.phone}
            maxLength={24}
            aria-invalid={invalid.phone || showWarn ? true : undefined}
            aria-describedby={described('phone', 'co-phone-hint')}
            onChange={(e) => {
              onChange('phone', latinDigits(e.target.value));
            }}
            onBlur={onPhoneBlur}
          />
          <div id="co-phone-hint" className="co-hint co-hint-in" aria-live="polite">
            {ph.ok ? (
              <span className="co-chip ok" ref={chipRef}>
                <Icon name="check" size={13} />
                <span className="co-chip-t">
                  <span className="co-chip-w">{w('form.weCall')} </span>
                  <b data-testid="co-phone-clean">{ph.nice}</b>
                </span>
              </span>
            ) : showWarn ? (
              <>
                <span className="co-chip warn" aria-hidden="true" ref={chipRef}>
                  <Icon name="info" size={13} />
                  <span className="co-chip-t">{shortWarn()}</span>
                </span>
                <span className="sr">{w(ph.reason === 'prefix' ? 'form.phonePrefix' : 'form.phoneLength')}</span>
              </>
            ) : null}
          </div>
        </div>
      </>,
    ),
    address: box(
      'address',
      <>
        <label className="label" htmlFor="co-address">
          {w('form.address')}
        </label>
        <textarea
          id="co-address"
          name="address"
          className="input co-addr"
          rows={2}
          autoComplete="street-address"
          placeholder={w('form.addressPh')}
          value={form.address}
          maxLength={500}
          aria-invalid={invalid.address ? true : undefined}
          aria-describedby={described('address')}
          onChange={(e) => onChange('address', e.target.value)}
          onBlur={onAddressBlur}
        />
      </>,
    ),
  };
  return (
    <>
      {fields.map((f) => (
        <Fragment key={f}>{F[f]}</Fragment>
      ))}
    </>
  );
}
