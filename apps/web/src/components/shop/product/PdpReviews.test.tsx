// PR 65 follow-up 233 — the shop's public reply under a review: drawn only while the owner shows replies, and only
// under the review it answers. Every value is a made-up test value.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import en from '../../../../messages/shop-more.en.json';
import { t, type Dict } from '@/lib/i18n';
import type { ShopContext } from '@/lib/shop/context';
import type { PdpReviewRow } from '@/lib/shop/pdp-reviews';
import { PdpReviews } from './PdpReviews';

const c = { lang: 'en', bnDigits: false, vars: { store: 'Sample store' }, s: { 'slider.engine': { kind: 'css' } }, t: (k: string, v?: Record<string, string | number>) => t(en as Dict, k, v), num: (n: number) => String(n) } as unknown as ShopContext;
const SET = registry['pdp.reviews'].default;
const row = (id: string, reply: string | null): PdpReviewRow => ({ id, rating: 5, title: null, body: 'Sample words.', name: 'Rafi', verified: true, heightCm: null, weightKg: null, sizeLabel: 'M', colourName: null, fit: null, photo: null, reply });
const data = { rows: [row('a', 'Thank you, Rafi!'), row('b', null)], average: 5, total: 2 };

describe('the shop reply under a review (follow-up 233)', () => {
  it('off (as shipped): no reply is drawn', () => {
    const html = renderToStaticMarkup(<PdpReviews c={c} set={SET} data={data} name="Sample polo" qa={false} />);
    expect(html).not.toContain('pdp-review-reply');
  });
  it('on: the reply sits under its own review only, with the team line', () => {
    const html = renderToStaticMarkup(<PdpReviews c={c} set={SET} data={data} name="Sample polo" qa={false} reply />);
    expect(html.match(/data-testid="pdp-review-reply"/g)?.length).toBe(1);
    expect(html).toContain('Thank you, Rafi!');
    expect(html).toContain('Sample store team');
  });
  it('the switch ships off', () => {
    expect(registry['pdp.reviewReply'].default).toEqual({ show: false });
  });
});
