// PR 606 — the bulk / corporate enquiry at /bulk-order and /bn/bulk-order (?from=bag|menu), only while the owner has
// the lane on (`orders.bulkLane`); off, the address is the shop's "page not found". Never in search engines: it is a
// form, not a page to land on. A test server's trial (POST /api/shop/try-bulk) draws it as if the lane were on.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { BulkSource } from '@extas/checkout/pure';
import { BulkPage } from '@/components/shop/bulk/BulkPage';
import { currentBag } from '@/lib/shop/bag';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ from?: string | string[] }> };

const sourceOf = (v: string | string[] | undefined): BulkSource => (v === 'bag' || v === 'menu' ? v : 'page');

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'bulk-order', c.t('bulk.pageTitle'))), robots: { index: false, follow: true } };
}

export default async function BulkOrder(props: Props) {
  const [c, sp] = await Promise.all([shopContext(), props.searchParams]);
  const lane = c.s['orders.bulkLane'];
  if (!lane.enabled) notFound();
  const source = sourceOf(sp.from);
  const [bag, s] = await Promise.all([source === 'bag' ? currentBag(c) : Promise.resolve(null), readPageSettings(['checkout.form.nameMin'] as const, c.storeId)]);
  return <BulkPage c={c} lane={lane} source={source} bag={bag} nameMin={s['checkout.form.nameMin']} />;
}
