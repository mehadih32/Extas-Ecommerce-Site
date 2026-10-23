// PR 131 — one section of My account, read and drawn on the server: signed out (or the session ran out) it is the login
// prompt that comes back here; a section the owner hides (`account.tabs`) is "page not found"; otherwise the frame
// (AccountShell) around the section's own body. The pages under app/(shop)/(store)/account call it.
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { orderCards, profileView, walletView } from '@extas/accounts';
import type { AccountTab } from '@extas/settings';
import { accountDeps } from '@/lib/shop/account';
import { accountPage, accountWords } from '@/lib/shop/account-view';
import { newestCards } from '@/lib/shop/catalogue';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { hrefIn, twinHref } from '@/lib/shop/lang';
import { AccountShell, LoginPrompt } from './AccountShell';
import { ForYouTab, OrdersTab, RewardsTab, WalletTab } from './AccountTabs';
import { DetailsForm, PasswordForm, Preferences } from './ProfileForms';

export async function AccountSection({ tab }: { tab: Exclude<AccountTab, 'wishlist'> }) {
  const c = await shopContext();
  const page = await accountPage(c);
  const deps = accountDeps();
  if (!page || !deps) {
    const s = await readPageSettings(['account.autoCreate.enabled'] as const, c.storeId);
    return <LoginPrompt c={c} here={hrefIn(c.lang, c.path)} autoCreate={s['account.autoCreate.enabled']} />;
  }
  if (!page.tabs.includes(tab)) notFound();
  const who = { storeId: c.storeId, customerId: page.me.customer.id };
  const s = await readPageSettings(['account.lists', 'account.addresses.max', 'account.login', 'checkout.wallet.enabled'] as const, c.storeId);
  let body: ReactNode;
  switch (tab) {
    case 'orders':
      body = <OrdersTab c={c} orders={await orderCards(deps, who)} />;
      break;
    case 'foryou':
      body = <ForYouTab c={c} newIn={s['account.lists'].newIn > 0 ? await newestCards(c.storeId, s['account.lists'].newIn, 'newest') : []} />;
      break;
    case 'rewards':
      body = <RewardsTab c={c} />;
      break;
    case 'wallet':
      body = <WalletTab c={c} wallet={await walletView(deps, who)} usable={s['checkout.wallet.enabled']} />;
      break;
    case 'profile': {
      const p = await profileView(deps, who);
      if (!p) notFound();
      const words = accountWords(c, ['profile.']);
      const langs = c.s['language.bengali.enabled'] ? { en: c.t('lang.en'), bn: c.t('lang.bn'), other: twinHref(c.lang, c.path) } : null;
      body = (
        <div className="stack s16" data-testid="acc-profile">
          <div className="acc-g2">
            <section className="card p20" aria-labelledby="pf-d">
              <h2 className="h3" id="pf-d">
                {c.t('account.profile.details')}
              </h2>
              <DetailsForm words={words} profile={p} max={s['account.addresses.max']} />
            </section>
            {s['account.login'].password ? <PasswordForm words={words} has={p.hasPassword} /> : null}
          </div>
          <Preferences words={words} consent={p.consent} lang={c.lang} langs={langs} />
        </div>
      );
      break;
    }
  }
  return (
    <AccountShell c={c} page={page} tab={tab}>
      {body}
    </AccountShell>
  );
}
