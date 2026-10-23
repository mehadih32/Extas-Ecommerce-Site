// PR 130 — the login page, at /account/login and /bn/account/login (noindex). `?next=` brings him back to the page he
// came from (a shop page of this site only).
import type { Metadata } from 'next';
import { LoginPage } from '@/components/shop/account/LoginPage';
import { signedIn } from '@/lib/shop/account';
import { safeNext } from '@/lib/shop/account-api';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  return { ...(await shopMetadata(c, 'login', c.t('account.login.pageTitle'))), robots: { index: false, follow: false } };
}

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const c = await shopContext();
  const [q, me, s] = await Promise.all([searchParams, signedIn(), readPageSettings(['account.login', 'account.autoCreate.enabled'] as const, c.storeId)]);
  const next = safeNext(Array.isArray(q.next) ? q.next[0] : q.next, c.lang);
  return <LoginPage c={c} me={me} next={next} passwordOn={s['account.login'].password} autoCreate={s['account.autoCreate.enabled']} />;
}
