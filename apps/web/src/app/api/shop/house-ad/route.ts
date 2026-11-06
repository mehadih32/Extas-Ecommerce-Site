// S12 · PR 592 — public: a house ad's click (?p=<place>&l=bn): counted once per place a shop day while `blog.houseAds`
// is on, the click cookie kept for the credit days, and the reader sent on to the ad's page (else the journal).
import { clickHandler } from '@/lib/journal/house-ads';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const d = bagApiDeps();
  return clickHandler(request, d ? { db: d.cart.db, settings: d.cart.settings, storeId: d.storeId } : null);
}
