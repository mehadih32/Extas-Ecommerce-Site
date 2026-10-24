// PR 131 — My orders, at /account/orders and /bn/account/orders (noindex): the same section as /account (the links
// in menus and messages name it). Each order's own page is under it (PR 134).
import type { Metadata } from 'next';
import { AccountSection } from '@/components/shop/account/AccountSection';
import { accountMetadata } from '@/lib/shop/account-view';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Promise<Metadata> {
  return accountMetadata('orders');
}

// S05 · PR 150: the whole history, a page of one group at a time (?show=open|delivered|ended&page=2)
export default async function MyOrders({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return <AccountSection tab="orders" query={{ show: q.show, page: q.page }} />;
}
