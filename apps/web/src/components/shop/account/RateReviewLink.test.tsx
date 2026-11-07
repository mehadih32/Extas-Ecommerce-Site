// Follow-up 238 — "Rate & review" on the order cards and the thank-you page: shown only while he may still review.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { askReview, reviewLeft, shownPhotoReward } from '@/lib/shop/review-link';
import { RateReviewLink } from './RateReviewLink';

describe('Rate & review beyond the order page (follow-up 238)', () => {
  it('shows only when the review state answers that a line is still open', () => {
    expect(reviewLeft({ ok: true, can: true })).toBe(true);
    expect(reviewLeft({ ok: true, can: false })).toBe(false);
    expect(reviewLeft({ ok: false })).toBe(false);
    expect(reviewLeft(null)).toBe(false);
  });

  it('asks only about a delivered order', () => {
    expect(askReview('DELIVERED')).toBe(true);
    for (const s of ['PLACED', 'IN_TRANSIT', 'RETURNED', 'CANCELLED', 'PARTIALLY_DELIVERED']) expect(askReview(s)).toBe(false);
  });

  it('draws nothing before the answer (no promise on the first paint)', () => {
    expect(renderToStaticMarkup(<RateReviewLink number="1001" href="/account/orders/1001" label="Rate & review" />)).toBe('');
  });

  it('follow-up 237 · says the photo reward only while it is on, has an amount and may be said (the form\'s rule)', () => {
    const on = { enabled: true, amountMinor: 5000, showOnForm: true };
    expect(shownPhotoReward(on)).toBe(5000);
    expect(shownPhotoReward({ ...on, showOnForm: false })).toBeNull();
    expect(shownPhotoReward({ ...on, enabled: false })).toBeNull();
    expect(shownPhotoReward({ ...on, amountMinor: null })).toBeNull();
    expect(shownPhotoReward({ ...on, amountMinor: 0 })).toBeNull();
  });
});
