// PR 131 — My orders, at /account/orders and /bn/account/orders (noindex): the same section as /account (the links
// in menus and messages name it). Each order's own page is under it (PR 134).
import type { Metadata } from 'next';
import { AccountSection } from '@/components/shop/account/AccountSection';
import { accountMetadata } from '@/lib/shop/account-view';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Promise<Metadata> {
  return accountMetadata('orders');
}

export default function MyOrders() {
  return <AccountSection tab="orders" />;
}
