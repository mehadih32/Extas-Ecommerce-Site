'use client';
// Follow-up 238 (PR 65, demo 60-account.js "Rate & review") — "Rate & review" on a delivered order's card in My orders
// and on its thank-you page, not only on the order's own page. It asks the review state (POST /api/account/review-state,
// the same answer the order page's form reads) after the first paint and shows the link only while he may still review
// a line of that order; anything else (signed out, reviews off, too late, all reviewed, an error) shows nothing. The
// link opens the order's page, where the form is. Follow-up 237: `extra` is the photo reward's figure, a small line under it.
import { useEffect, useState } from 'react';
import { afterPaint } from '@/lib/shop/later';
import { reviewLeft } from '@/lib/shop/review-link';
import { Icon } from '../Icon';
import { postJson } from '../checkout/quote-client';

export function RateReviewLink({ number, href, label, aria, extra = null, className = 'btn btn-sm btn-ghost', testId = 'rate-review' }: { number: string; href: string; label: string; aria?: string; extra?: string | null; className?: string; testId?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    const stop = afterPaint(() => {
      postJson<{ ok?: boolean; can?: boolean }>('/api/account/review-state', { number })
        .then((r) => {
          if (live && r.status === 200 && reviewLeft(r.data)) setShow(true);
        })
        .catch(() => undefined);
    });
    return () => {
      live = false;
      stop();
    };
  }, [number]);
  if (!show) return null;
  const link = (
    <a className={className} href={href} aria-label={aria} data-testid={testId}>
      <Icon name="star" size={15} />
      {label}
    </a>
  );
  if (!extra) return link;
  // follow-up 237: the photo reward's figure as a small line under the link (never inside the button)
  return (
    <span className="rr-wrap" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      {link}
      <span className="xs muted" data-testid={`${testId}-reward`}>
        {extra}
      </span>
    </span>
  );
}
