// PR 131 — a section of My account, at /account/<section> (foryou, rewards, wallet, profile; the wishlist and the login
// have their own pages). An old or loose word for a section goes to the section it means (/account/addresses → Profile);
// any other word is "page not found" (demo R15 bug 9b).
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ACCOUNT_TABS, type AccountTab } from '@extas/settings';
import { AccountSection } from '@/components/shop/account/AccountSection';
import { ACCOUNT_ALIAS, accountMetadata, tabHref } from '@/lib/shop/account-view';
import { shopContext } from '@/lib/shop/context';

export const dynamic = 'force-dynamic';

type Section = Exclude<AccountTab, 'wishlist'>;
const isSection = (v: string): v is Section => v !== 'wishlist' && (ACCOUNT_TABS as readonly string[]).includes(v);

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }): Promise<Metadata> {
  const { tab } = await params;
  return accountMetadata(isSection(tab) ? tab : 'orders');
}

export default async function Section({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const alias = ACCOUNT_ALIAS[tab];
  if (alias) permanentRedirect(tabHref(await shopContext(), alias));
  if (!isSection(tab)) notFound();
  return <AccountSection tab={tab} />;
}
