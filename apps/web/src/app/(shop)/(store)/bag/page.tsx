// PR 107 — the bag, at /bag and /bn/bag (the store shell around it; noindex: a bag is nobody's search result).
// PR 605: a test server's gift trial (POST /api/shop/try-gift) shows "Send as a gift" under Checkout.
// PR 610 (qa-gate I3): while checkout is paused (the ERP holds the account) the bag says so from the first paint.
import type { Metadata } from 'next';
import { BagPage } from '@/components/shop/bag/BagPage';
import { bagSettings, currentBag } from '@/lib/shop/bag';
import { checkoutPausedNow } from '@/lib/shop/checkout';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { tryGiftOn } from '@/lib/shop/try-gift';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'bag', c.t('bag.title'))), robots: { index: false, follow: true } };
}

export default async function Bag(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await shopContext();
  // PR 574: `?btpl=B1…B5` previews a bag template (only while `combos.template.preview` is on)
  const q = (await props.searchParams).btpl;
  const btpl = typeof q === 'string' ? q : null;
  const [view, s, trial, paused] = await Promise.all([currentBag(c), bagSettings(c.storeId), tryGiftOn(), checkoutPausedNow(c.storeId)]);
  // PR 605: a test server's gift trial (/api/shop/try-gift) shows "Send as a gift" as if gift mode were on
  return <BagPage c={c} view={view} s={trial ? { ...s, 'checkout.gift': { ...s['checkout.gift'], enabled: true } } : s} btpl={btpl} paused={paused} />;
}
