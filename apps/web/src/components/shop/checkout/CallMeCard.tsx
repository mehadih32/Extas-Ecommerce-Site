'use client';
// CN-020 (3) · SIM-F-046 — "Call me" at the checkout (`checkout.callMe`, off as shipped). A customer who keeps being
// stopped on one box (`failedTries` refused Confirms on the same box) or who sits on an unfinished form for
// `idleSeconds` sees one calm card under his details: his number (already typed, or typed here) and one "Call me"
// button. The tap puts a call-back in the Support inbox; nothing else changes and his form stays as it is. "Not now"
// puts the card away for this visit. Every button is a 44 px tap target.
import { useEffect, useRef, useState } from 'react';
import { phoneNormalizeBD } from '@extas/checkout/pure';
import { postJson } from './quote-client';

export const CALL_ME_URL = '/api/checkout/call-me';

export interface CallMeConfig {
  /** Refused Confirms on one box before the card shows (`checkout.callMe.failedTries`). */
  failedTries: number;
  /** Seconds on an unfinished form without a change before the card shows (`checkout.callMe.idleSeconds`). */
  idleSeconds: number;
}

export type CallMeReason = 'tries' | 'idle';
export interface CallMeOffer {
  reason: CallMeReason;
  field?: string;
}

const MS = 1000;

/**
 * When to offer the card: `refused(field)` counts a refused Confirm on a box; the pause clock starts again on every
 * change of `activity`, and runs only while the form is unfinished. Null config: never.
 */
export function useCallMe(cfg: CallMeConfig | null, unfinished: boolean, activity: string) {
  const [offer, setOffer] = useState<CallMeOffer | null>(null);
  const [away, setAway] = useState(false);
  const tries = useRef<Record<string, number>>({});
  const live = cfg !== null && !away && offer === null;
  useEffect(() => {
    if (!live || !unfinished || !cfg) return;
    const timer = setTimeout(() => setOffer({ reason: 'idle' }), cfg.idleSeconds * MS);
    return () => clearTimeout(timer);
  }, [live, unfinished, activity, cfg]);
  const refused = (field: string) => {
    if (!live || !cfg) return;
    const n = (tries.current[field] ?? 0) + 1;
    tries.current[field] = n;
    if (n >= cfg.failedTries) setOffer({ reason: 'tries', field });
  };
  return { offer: away ? null : offer, refused, putAway: () => setAway(true) };
}

type Words = (k: string, vars?: Record<string, string | number>) => string;

export interface CallMeCardProps {
  offer: CallMeOffer;
  /** What he typed in the details (the number is offered back to him). */
  phone: string;
  name: string;
  lang: string;
  w: Words;
  onAway(): void;
}

type State = 'ready' | 'sending' | 'done' | 'many' | 'bad' | 'error';

export function CallMeCard({ offer, phone: typed, name, lang, w, onAway }: CallMeCardProps) {
  const [phone, setPhone] = useState(typed);
  const [state, setState] = useState<State>('ready');
  const send = async () => {
    const p = phoneNormalizeBD(phone);
    if (!p.ok) return setState('bad');
    setPhone(p.nice);
    setState('sending');
    const r = await postJson<{ ok: boolean; error?: string }>(CALL_ME_URL, { phone: p.digits, name, reason: offer.reason, field: offer.field, lang });
    if (r.data?.ok) return setState('done');
    if (r.data?.error === 'CALLBACK_OFF') return onAway();
    if (r.data?.error === 'TOO_MANY') return setState('many');
    if (r.data?.error === 'INVALID_INPUT') return setState('bad');
    setState('error');
  };
  if (state === 'done' || state === 'many')
    return (
      <div className="co-callme co-callme-done" role="status" data-testid="co-callme-done">
        <b>{w(state === 'done' ? 'callMe.done' : 'callMe.many', { phone })}</b>
        <span className="small muted">{w('callMe.keep')}</span>
      </div>
    );
  return (
    <div className="co-callme" role="region" aria-labelledby="co-callme-t" data-testid="co-callme" data-reason={offer.reason}>
      <b id="co-callme-t">{w(offer.reason === 'tries' ? 'callMe.titleTries' : 'callMe.titleIdle')}</b>
      <span className="small">{w('callMe.text')}</span>
      <label className="co-callme-l" htmlFor="co-callme-phone">
        {w('callMe.phone')}
      </label>
      <input
        id="co-callme-phone"
        className="input co-callme-in"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          if (state === 'bad') setState('ready');
        }}
        aria-invalid={state === 'bad'}
        aria-describedby={state === 'bad' || state === 'error' ? 'co-callme-err' : undefined}
        data-testid="co-callme-phone"
      />
      {state === 'bad' || state === 'error' ? (
        <span className="co-callme-err small" id="co-callme-err" role="alert">
          {w(state === 'bad' ? 'form.phoneLength' : 'callMe.error')}
        </span>
      ) : null}
      <div className="co-callme-row">
        <button type="button" className="btn btn-primary co-callme-go" onClick={() => void send()} disabled={state === 'sending'} aria-busy={state === 'sending'} data-testid="co-callme-go">
          {w(state === 'sending' ? 'callMe.sending' : 'callMe.go')}
        </button>
        <button type="button" className="btn btn-ghost co-callme-x" onClick={onAway} data-testid="co-callme-away">
          {w('callMe.away')}
        </button>
      </div>
    </div>
  );
}
