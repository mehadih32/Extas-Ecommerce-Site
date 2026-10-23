// PR 131 — what every My account page reads before it draws: the signed-in customer's header figures (orders, wallet,
// saved products), the sections the owner shows (`account.tabs`), and the words the client forms need. Without a
// database, or when it is slow, the page draws signed out (the login prompt), never an error.
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { accountSummary, type AccountSummary } from '@extas/accounts';
import type { AccountTab } from '@extas/settings';
import type { CustomerAuth } from '@extas/auth';
import { accountDeps, signedIn } from './account';
import { BAG_COOKIE } from './bag-model';
import type { ShopContext } from './context';
import { readPageSettings, shopContext } from './context';
import { SHOP_DICTS, keysOf } from './dict';
import { hrefIn } from './lang';
import { shopMetadata } from './meta';
import { ROUTES } from './routes';
import { visitorOf, wishCount } from './wishlist';

/** Old or loose words for a section, sent to the section they mean (demo ACC_ALIAS). */
export const ACCOUNT_ALIAS: Readonly<Record<string, AccountTab>> = { addresses: 'profile', address: 'profile', details: 'profile', size: 'foryou', offers: 'foryou' };

/** The address of a section of My account (My orders is /account itself). */
export const tabHref = (c: Pick<ShopContext, 'lang'>, tab: AccountTab): string => hrefIn(c.lang, tab === 'orders' ? ROUTES.account : tab === 'wishlist' ? ROUTES.wishlist : `${ROUTES.account}/${tab}`);

/** A section's title ("Wallet · My account"), never indexed: an account page is nobody's search result. */
export async function accountMetadata(tab: AccountTab): Promise<Metadata> {
  const c = await shopContext();
  const title = tab === 'orders' ? c.t('account.title') : `${c.t(`account.tabs.${tab}`)} · ${c.t('account.title')}`;
  return { ...(await shopMetadata(c, 'account', title)), robots: { index: false, follow: false } };
}

export interface AccountPage {
  me: CustomerAuth;
  summary: AccountSummary;
  tabs: AccountTab[];
  wishCount: number;
  visitorId: string | null;
  /** PR 133: the profile photo (kept in this browser only). */
  photo: { enabled: boolean; maxMb: number; sizePx: number };
}

/** The signed-in customer's page data, or null (signed out, or the account could not be read). */
export async function accountPage(c: ShopContext): Promise<AccountPage | null> {
  const me = await signedIn();
  const deps = me ? accountDeps() : null;
  if (!me || !deps) return null;
  const visitorId = visitorOf((await cookies()).get(BAG_COOKIE)?.value);
  try {
    const [summary, s, wish] = await Promise.all([
      accountSummary(deps, { storeId: c.storeId, customerId: me.customer.id }),
      readPageSettings(['account.tabs', 'account.photo'] as const, c.storeId),
      wishCount({ db: deps.db, storeId: c.storeId }, visitorId ?? '', me.customer.id),
    ]);
    if (!summary) return null;
    return { me, summary, tabs: s['account.tabs'], wishCount: wish, visitorId, photo: s['account.photo'] };
  } catch (e) {
    console.warn(`shop: My account unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}

/** A day (and, when asked, the time) in the store's own time zone and the page's language and digits. */
export function dateText(c: ShopContext, iso: string, withTime = false): string {
  const bn = c.lang === 'bn';
  return new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: c.s['store.timeZone'],
    numberingSystem: bn && c.bnDigits ? 'beng' : 'latn',
  }).format(new Date(iso));
}

/** Every `account.<prefix>*` word (plus the errors) for a client form, slots like {store} filled. */
export function accountWords(c: ShopContext, prefixes: readonly string[]): Record<string, string> {
  const want = [...prefixes, 'err.'].map((p) => `account.${p}`);
  return Object.fromEntries(
    keysOf(SHOP_DICTS[c.lang])
      .filter((k) => want.some((p) => k.startsWith(p)))
      .map((k) => [k.slice('account.'.length), c.t(k, c.vars)]),
  );
}
