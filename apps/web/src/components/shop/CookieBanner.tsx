'use client';
// PR 743 — the cookie banner (`cookie.banner`, Website › Page settings › Cookie banner; off as shipped). The server draws it
// only while it is on and the visitor has no remembered choice (lib/shop/cookie-banner), so it never flickers in for
// someone who chose. A button writes the choice into a cookie for the owner's days and hides the banner; the page behind it
// stays usable. The words, the buttons and the place are the owner's; the policy link opens the shop's Cookie policy page.
import { useState } from 'react';
import { choiceCookie, CONSENT_NO, CONSENT_YES } from '@/lib/shop/cookie-banner';
import './cookie-banner.css';

export interface CookieBannerProps {
  text: string;
  accept: string;
  /** null: no "No" button. */
  decline: string | null;
  /** null: no link. */
  policy: { href: string; label: string } | null;
  position: 'bottom' | 'card';
  days: number;
}

export function CookieBanner(p: CookieBannerProps) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const choose = (c: typeof CONSENT_YES | typeof CONSENT_NO) => {
    try {
      document.cookie = choiceCookie(c, p.days);
    } catch {
      // a browser that refuses cookies simply asks again next time
    }
    setGone(true);
  };
  return (
    <div className={`cookie-banner cookie-${p.position}`} role="dialog" aria-live="polite" aria-label={p.text} data-testid="cookie-banner">
      <p className="cookie-text">
        {p.text}
        {p.policy ? (
          <>
            {' '}
            <a href={p.policy.href}>{p.policy.label}</a>
          </>
        ) : null}
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn btn-primary" onClick={() => choose(CONSENT_YES)} data-testid="cookie-accept">
          {p.accept}
        </button>
        {p.decline ? (
          <button type="button" className="btn btn-ghost" onClick={() => choose(CONSENT_NO)} data-testid="cookie-decline">
            {p.decline}
          </button>
        ) : null}
      </div>
    </div>
  );
}
