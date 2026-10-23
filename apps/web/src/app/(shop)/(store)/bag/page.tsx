// PR 107 — the bag, at /bag and /bn/bag (the store shell around it; noindex: a bag is nobody's search result).
import type { Metadata } from 'next';
import { BagPage } from '@/components/shop/bag/BagPage';
import { bagSettings, currentBag } from '@/lib/shop/bag';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'bag', c.t('bag.title'))), robots: { index: false, follow: true } };
}

export default async function Bag() {
  const c = await shopContext();
  const [view, s] = await Promise.all([currentBag(c), bagSettings(c.storeId)]);
  return <BagPage c={c} view={view} s={s} />;
}
