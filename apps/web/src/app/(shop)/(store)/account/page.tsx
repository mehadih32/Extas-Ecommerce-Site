// PR 131 — My account, at /account and /bn/account (noindex): My orders, inside the account's frame; signed out, the
// login prompt that comes back here.
import type { Metadata } from 'next';
import { AccountSection } from '@/components/shop/account/AccountSection';
import { accountMetadata } from '@/lib/shop/account-view';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Promise<Metadata> {
  return accountMetadata('orders');
}

export default function MyAccount() {
  return <AccountSection tab="orders" />;
}
