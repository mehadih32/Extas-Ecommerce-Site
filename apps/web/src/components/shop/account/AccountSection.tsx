// PR 131 — one section of My account, read and drawn on the server: signed out (or the session ran out) it is the login
// prompt that comes back here; a section the owner hides (`account.tabs`) is "page not found"; otherwise the frame
// (AccountShell) around the section's own body. The pages under app/(shop)/(store)/account call it.
// PR 132: the offer banner on top of My orders; For you lists the same offers as cards.
// S05 · PR 150: My orders is the whole history — a page of one group at a time, from the address's `show` and `page`.
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { isOrderShow, liveOffers, offerBanner, orderHistory, pageOf, profileView, walletView } from '@extas/accounts';
import type { AccountTab } from '@extas/settings';
import { accountDeps } from '@/lib/shop/account';
import { accountPage, accountWords } from '@/lib/shop/account-view';
import { newestCards } from '@/lib/shop/catalogue';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { hrefIn, twinHref } from '@/lib/shop/lang';
import { AccountShell, LoginPrompt } from './AccountShell';
import { ForYouTab, OrdersTab, RewardsTab, WalletTab } from './AccountTabs';
import { initialsOf } from '@extas/accounts/pure';
import { PhotoCard } from './AccountPhoto';
import { OfferBanner, OfferCards } from './OfferBanner';
import { DetailsForm, PasswordForm, Preferences } from './ProfileForms';

export async function AccountSection({ tab, query = {} }: { tab: Exclude<AccountTab, 'wishlist'>; query?: { show?: unknown; page?: unknown } }) {
  const c = await shopContext();
  const page = await accountPage(c);
  const deps = accountDeps();
  if (!page || !deps) {
    const s = await readPageSettings(['account.autoCreate.enabled'] as const, c.storeId);
    return <LoginPrompt c={c} here={hrefIn(c.lang, c.path)} autoCreate={s['account.autoCreate.enabled']} />;
  }
  if (!page.tabs.includes(tab)) notFound();
  const who = { storeId: c.storeId, customerId: page.me.customer.id };
  const s = await readPageSettings(['account.lists', 'account.addresses.max', 'account.login', 'checkout.wallet.enabled', 'account.offerBanner', 'account.history'] as const, c.storeId);
  let body: ReactNode;
  switch (tab) {
    case 'orders': {
      // PR 132: the banner sits on top of My orders only (For you lists the offers, Wallet has its own balance)
      // PR 150: a group only while the owner offers the groups; any page of it (past the end: the last one)
      const filters = s['account.history'].filters;
      const show = filters && isOrderShow(query.show) ? query.show : 'all';
      const [banner, history] = await Promise.all([offerBanner(deps, who), orderHistory(deps, { ...who, show, page: pageOf(query.page) })]);
      body = (
        <>
          <OfferBanner c={c} banner={banner} walletUsable={s['checkout.wallet.enabled']} showAll={page.tabs.includes('foryou')} />
          <OrdersTab c={c} history={history} filters={filters} />
        </>
      );
      break;
    }
    case 'foryou': {
      const [offers, newIn] = await Promise.all([
        s['account.offerBanner'].enabled ? liveOffers(deps, who) : Promise.resolve([]),
        s['account.lists'].newIn > 0 ? newestCards(c.storeId, s['account.lists'].newIn, 'newest') : Promise.resolve([]),
      ]);
      body = <ForYouTab c={c} newIn={newIn} offers={offers.length ? <OfferCards c={c} offers={offers} /> : null} />;
      break;
    }
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
          {page.photo.enabled ? <PhotoCard words={accountWords(c, ['photo.'])} customerId={page.summary.customerId} initials={initialsOf(page.summary.name)} maxMb={page.photo.maxMb} sizePx={page.photo.sizePx} /> : null}
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
