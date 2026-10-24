// PR 131 — My account, at /account and /bn/account (noindex): My orders, inside the account's frame; signed out, the
// login prompt that comes back here.
import type { Metadata } from 'next';
import { AccountSection } from '@/components/shop/account/AccountSection';
import { accountMetadata } from '@/lib/shop/account-view';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Promise<Metadata> {
  return accountMetadata('orders');
}

// S05 · PR 150: the whole history, a page of one group at a time (?show=open|delivered|ended&page=2)
export default async function MyAccount({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  return <AccountSection tab="orders" query={{ show: q.show, page: q.page }} />;
}
