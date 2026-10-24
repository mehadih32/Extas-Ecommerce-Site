'use client';
// PR 65 — "Rate & review" on a delivered order line (demo 60-account.js `ord_revHTML`, V12.2): the stars, how the size
// felt, his height and weight, his own photo, and his words. It posts to /api/account/review as one form (multipart,
// because of the photo) and then says, in the shop's own words, that the review will appear after the shop's check —
// because that is exactly what happens: it is saved waiting, and only a member of staff publishes it (SIM-F-008).
//
// The box opens in place, under the line, with no library and no popup: the page stays where it is. Every word comes
// from the shop dictionary (`account.review.*`), so the owner can change all of it.
import { useRef, useState } from 'react';
import { REVIEW_STAR_PATH } from '@/lib/shop/pdp-reviews';
import { showToast } from '../toast';
import { Icon } from '../Icon';

export type ReviewWords = Record<string, string>;

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export interface ReviewFormProps {
  words: ReviewWords;
  /** The order and the line being reviewed. */
  number: string;
  orderItemId: string;
  name: string;
  askFit: boolean;
  askBody: boolean;
  bodyMax: number;
  photos: boolean;
  photoMaxMb: number;
  /** The reward line, already in money the shop writes ("৳50"); null: the owner has the perk off. */
  rewardText: string | null;
}

const FITS = [
  ['SMALL', 'small'],
  ['RIGHT', 'right'],
  ['BIG', 'big'],
] as const;

const STARS = [1, 2, 3, 4, 5] as const;

export function ReviewForm(props: ReviewFormProps) {
  const w = (k: string, v: Record<string, string | number> = {}) => fill(props.words[k] ?? k, v);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [fit, setFit] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weight, setWeight] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  if (sent) {
    return (
      <div className="ord-rev-done xs brandc bold" data-testid="order-review-sent">
        <Icon name="check" size={13} />
        {w('state.pending')}
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost ord-rev-cta" data-testid="order-review-open" onClick={() => setOpen(true)}>
        <Icon name="star" size={15} />
        {w('cta')}
      </button>
    );
  }

  return (
    <form
      className="ord-rev stack s12"
      noValidate
      data-testid="order-review-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget; // React clears currentTarget once the handler awaits
        if (rating < 1) return setErr(w('err.rating'));
        setErr(null);
        setBusy(true);
        const data = new FormData();
        data.set('number', props.number);
        data.set('orderItemId', props.orderItemId);
        data.set('rating', String(rating));
        if (body.trim()) data.set('body', body.trim().slice(0, props.bodyMax));
        if (props.askFit && fit) data.set('fit', fit);
        if (props.askBody) {
          const cm = Math.round((Number(feet || 0) * 12 + Number(inches || 0)) * 2.54);
          if (cm >= 80 && cm <= 260) data.set('heightCm', String(cm));
          const kg = Number(weight || 0);
          if (Number.isInteger(kg) && kg >= 25 && kg <= 250) data.set('weightKg', String(kg));
        }
        const picked = file.current?.files?.[0];
        if (props.photos && picked) data.set('photo', picked);
        let status = 0;
        let payload: Record<string, unknown> = {};
        try {
          const res = await fetch('/api/account/review', { method: 'POST', body: data });
          status = res.status;
          payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        } catch {
          status = 0;
        }
        setBusy(false);
        if (status === 201) {
          setSent(true);
          return showToast(form, w('sent'));
        }
        const code = String(payload.error ?? '');
        if (status === 401) return setErr(w('err.signedOut'));
        if (code === 'REVIEWS_OFF') return setErr(w('err.off'));
        if (code === 'NOT_DELIVERED') return setErr(w('err.notDelivered'));
        if (code === 'TOO_LATE') return setErr(w('err.late'));
        if (code === 'CONFLICT') return setErr(w('err.exists'));
        if (code === 'TOO_LARGE') return setErr(w('err.big'));
        if (['NOT_AN_IMAGE', 'TYPE_NOT_ALLOWED', 'TOO_SMALL'].includes(code)) return setErr(w('err.photo'));
        setErr(w('err.offline'));
      }}
    >
      <div className="row between top" style={{ gap: 10 }}>
        <div>
          <div className="small bold">{w('title')}</div>
          <div className="xs muted">{props.name}</div>
        </div>
        <button type="button" className="link xs" data-testid="order-review-close" onClick={() => setOpen(false)}>
          {w('close')}
        </button>
      </div>

      <fieldset className="ord-rev-stars">
        <legend className="label">{w('rating')}</legend>
        <div className="row" style={{ gap: 4 }}>
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              className={`ord-rev-star${n <= rating ? ' on' : ''}`}
              aria-pressed={n === rating}
              aria-label={w('ratingN', { n })}
              data-testid={`order-review-star-${n}`}
              onClick={() => setRating(n)}
            >
              {/* the same star the product page draws: filled for the stars he gave, the line colour for the rest */}
              <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" fill={n <= rating ? 'var(--brand)' : 'var(--line)'}>
                <path d={REVIEW_STAR_PATH} />
              </svg>
            </button>
          ))}
        </div>
      </fieldset>

      {props.askFit ? (
        <fieldset>
          <legend className="label">{w('fitAsk')}</legend>
          <div className="row wrap" style={{ gap: 8 }}>
            {FITS.map(([value, key]) => (
              <button key={value} type="button" className={`chip${fit === value ? ' on' : ''}`} aria-pressed={fit === value} data-testid={`order-review-fit-${key}`} onClick={() => setFit(fit === value ? '' : value)}>
                {w(`fit.${key}`)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {props.askBody ? (
        <div className="ord-rev-body">
          <div>
            <label className="label" htmlFor={`rv-ft-${props.orderItemId}`}>
              {w('height')}
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input id={`rv-ft-${props.orderItemId}`} className="input" inputMode="numeric" value={feet} onChange={(e) => setFeet(e.target.value.replace(/\D/g, '').slice(0, 1))} placeholder={w('feet')} aria-label={w('feet')} />
              <input className="input" inputMode="numeric" value={inches} onChange={(e) => setInches(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder={w('inches')} aria-label={w('inches')} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`rv-kg-${props.orderItemId}`}>
              {w('weight')}
            </label>
            <input id={`rv-kg-${props.orderItemId}`} className="input" inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </div>
        </div>
      ) : null}

      {props.photos ? (
        <div>
          <label className="label" htmlFor={`rv-ph-${props.orderItemId}`}>
            {w('photo')}
          </label>
          <input ref={file} id={`rv-ph-${props.orderItemId}`} className="input" type="file" accept="image/*" data-testid="order-review-photo" />
          {props.rewardText ? (
            <div className="xs brandc mt8" data-testid="order-review-reward">
              {w('photoReward', { amount: props.rewardText })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor={`rv-tx-${props.orderItemId}`}>
          {w('body')}
        </label>
        <textarea id={`rv-tx-${props.orderItemId}`} className="input" rows={3} maxLength={props.bodyMax} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>

      <div role="alert">{err ? <div className="acc-err">{err}</div> : null}</div>
      <button type="submit" className="btn btn-primary" disabled={busy} data-testid="order-review-submit">
        {busy ? w('sending') : w('submit')}
      </button>
    </form>
  );
}

/** The line's own state once something has been written about it (nothing is shown before the shop's check). */
export function ReviewState({ words, state }: { words: ReviewWords; state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN' }) {
  const key = state === 'APPROVED' ? 'published' : state === 'PENDING' ? 'pending' : 'hidden';
  return (
    <div className="ord-rev-done xs muted" data-testid="order-review-state" data-state={state}>
      <Icon name={state === 'APPROVED' ? 'check' : 'clock'} size={13} />
      {words[`state.${key}`] ?? key}
    </div>
  );
}
