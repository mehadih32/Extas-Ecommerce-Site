'use client';
// PR 123 — the last card of the form (demo 51-checkout.js `msgs`, Note 54 #11): the two marketing ticks, each its own
// channel (SMS says he can stop any time), and "Items can be exchanged for size" · "Terms", which open the policies.
import type { ConsentInput } from '@extas/checkout/pure';

export interface ConsentCardProps {
  /** The ticks as they stand, or null when the owner switched them off (only the links show). */
  consent: ConsentInput | null;
  onChange: (c: ConsentInput) => void;
  w: (k: string) => string;
  links: { exchange: string; terms: string };
}

export function ConsentCard({ consent, onChange, w, links }: ConsentCardProps) {
  const terms = w('terms');
  return (
    <section className="card co-sec stack s12 co-msgs" data-testid="co-msgs">
      {consent ? (
        <>
          <label className="check ct-tick" data-testid="co-consent-sms">
            <input type="checkbox" checked={consent.sms} onChange={(e) => onChange({ ...consent, sms: e.target.checked })} />
            <span>{w('consent.sms')}</span>
          </label>
          <label className="check ct-tick" data-testid="co-consent-wa">
            <input type="checkbox" checked={consent.whatsapp} onChange={(e) => onChange({ ...consent, whatsapp: e.target.checked })} />
            <span>{w('consent.wa')}</span>
          </label>
        </>
      ) : null}
      <p className="xs muted co-terms" style={{ margin: 0 }}>
        <a className="link" href={links.exchange} data-testid="co-exch-link">
          {w('exch')}
        </a>
        {terms ? (
          <>
            <span className="co-tsep" aria-hidden="true">
              {' · '}
            </span>
            <a className="link" href={links.terms}>
              {terms}
            </a>
          </>
        ) : null}
      </p>
    </section>
  );
}
