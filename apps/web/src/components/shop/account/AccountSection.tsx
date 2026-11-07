// PR 131 — one section of My account, read and drawn on the server: signed out (or the session ran out) it is the login
// prompt that comes back here; a section the owner hides (`account.tabs`) is "page not found"; otherwise the frame
// (AccountShell) around the section's own body. The pages under app/(shop)/(store)/account call it.
// PR 132: the offer banner on top of My orders; For you lists the same offers as cards.
// S14 · PR 301: Profile's Birthday card while the owner's `customers.birthday` is on.
// S18 · PR 623: Profile's "Your data" card (a copy or erasure of his data) while `privacy.customerRequests` is on.
// S13 · PR 273: For you's "Invite a friend" card (his invite code) while the referral programme runs.
// S05 · PR 150: My orders is the whole history — a page of one group at a time, from the address's `show` and `page`.
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { isOrderShow, liveOffers, offerBanner, orderHistory, pageOf, profileView, walletView } from '@extas/accounts';
import type { AccountTab } from '@extas/settings';
import { customerPrivacyState, pointsOf, PRIVACY_NOTE_MAX } from '@extas/customers';
import { myInvite } from '@extas/rules';
import { accountDeps } from '@/lib/shop/account';
import { accountPage, accountWords } from '@/lib/shop/account-view';
import { newestCards } from '@/lib/shop/catalogue';
import { readPageSettings, shopContext } from '@/lib/shop/context';
import { fill } from '@/lib/shop/dict';
import { hrefIn, twinHref } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { AccountShell, LoginPrompt } from './AccountShell';
import { ForYouTab, OrdersTab, RewardsTab, WalletTab } from './AccountTabs';
import { initialsOf } from '@extas/accounts/pure';
import { PhotoCard } from './AccountPhoto';
import { InviteCard } from './InviteCard';
import { OfferBanner, OfferCards } from './OfferBanner';
import { BirthdayForm, DetailsForm, PasswordForm, Preferences } from './ProfileForms';
import { PrivacyCard } from './PrivacyCard';
import { shopNotFound } from '@/lib/shop/not-found';
import { FIT_COOKIE } from '@/lib/shop/pdp-finder';
import { sizeCard } from '@/lib/shop/size-card';
import { sizeGuideData } from '@/lib/shop/size-guide';

export async function AccountSection({ tab, query = {} }: { tab: Exclude<AccountTab, 'wishlist'>; query?: { show?: unknown; page?: unknown } }) {
  const c = await shopContext();
  const page = await accountPage(c);
  const deps = accountDeps();
  if (!page || !deps) {
    const s = await readPageSettings(['account.autoCreate.enabled'] as const, c.storeId);
    return <LoginPrompt c={c} here={hrefIn(c.lang, c.path)} autoCreate={s['account.autoCreate.enabled']} />;
  }
  if (!page.tabs.includes(tab)) shopNotFound(c);
  const who = { storeId: c.storeId, customerId: page.me.customer.id };
  const s = await readPageSettings(['account.lists', 'account.addresses.max', 'account.login', 'checkout.wallet.enabled', 'account.offerBanner', 'account.history', 'customers.birthday'] as const, c.storeId);
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
      const [offers, newIn, guide, jar] = await Promise.all([
        s['account.offerBanner'].enabled ? liveOffers(deps, who) : Promise.resolve([]),
        s['account.lists'].newIn > 0 ? newestCards(c.storeId, s['account.lists'].newIn, 'newest') : Promise.resolve([]),
        // follow-up 144: "Your size" from this phone's kept height and weight on the shop's own charts
        sizeGuideData(c.storeId, c.lang),
        cookies(),
      ]);
      const size = guide ? sizeCard(jar.get(FIT_COOKIE)?.value, guide.finder, guide.entries) : null;
      // S13 · PR 273: his invite code while the referral programme runs (signed in only: this page is)
      const invite = await myInvite({ db: deps.db, settings: deps.settings }, who).catch(() => null);
      let card: ReactNode = null;
      if (invite) {
        const words = accountWords(c, ['invite.']);
        const [programme, dist] = await Promise.all([deps.settings.value('referrals.programme', { storeId: c.storeId }), deps.settings.value('rules.coupons.distribution', { storeId: c.storeId })]);
        const reward = programme.rewardMinor === null ? '' : fill(words['invite.reward'] ?? '', { amount: c.money(programme.rewardMinor) });
        const usedLine = invite.used > 0 ? fill(words['invite.used'] ?? '', { n: c.num(invite.used) }) : null;
        card = <InviteCard code={invite.code} sub={fill(words['invite.sub'] ?? '', { reward })} usedLine={usedLine} path={dist.links ? `${hrefIn(c.lang, ROUTES.bag)}?code=${encodeURIComponent(invite.code)}` : hrefIn(c.lang, '/')} words={words} />;
      }
      body = (
        <>
          {card}
          <ForYouTab c={c} newIn={newIn} offers={offers.length ? <OfferCards c={c} offers={offers} /> : null} size={size} />
        </>
      );
      break;
    }
    case 'rewards':
      // S14 · PR 296: his points while the owner's rule gives something (never an error page: the section stays)
      body = <RewardsTab c={c} points={await pointsOf({ db: deps.db, settings: deps.settings }, c.storeId, page.me.customer.id).catch(() => null)} />;
      break;
    case 'wallet':
      body = <WalletTab c={c} wallet={await walletView(deps, who)} usable={s['checkout.wallet.enabled']} />;
      break;
    case 'profile': {
      const [p, privacy] = await Promise.all([profileView(deps, who), customerPrivacyState({ db: deps.db, settings: deps.settings, now: deps.now }, who)]);
      if (!p) shopNotFound(c);
      const words = accountWords(c, ['profile.']);
      // PR 301: the month names in the page's language (Western digits stay the shop's rule)
      const monthName = new Intl.DateTimeFormat(c.lang === 'bn' ? 'bn-BD' : 'en-GB', { month: 'long', timeZone: 'UTC' });
      const months = Array.from({ length: 12 }, (_, i) => monthName.format(new Date(Date.UTC(2000, i, 1))));
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
          {s['customers.birthday'].enabled ? <BirthdayForm words={words} birthday={p.birthday} askYear={s['customers.birthday'].askYear} months={months} /> : null}
          <Preferences words={words} consent={p.consent} lang={c.lang} langs={langs} />
          {privacy ? (
            <PrivacyCard
              words={words}
              owner={{ title: privacy.rule.words.title[c.lang], notice: privacy.rule.words.notice[c.lang], copy: privacy.rule.words.copy[c.lang], erasure: privacy.rule.words.erasure[c.lang] }}
              kinds={privacy.rule.kinds}
              latest={Object.fromEntries(Object.entries(privacy.latest).map(([k, q]) => [k, { id: q.id, kind: q.kind, status: q.status, createdAt: q.createdAt.toISOString(), readyUntil: q.readyUntil?.toISOString() ?? null }]))}
              noteMax={PRIVACY_NOTE_MAX}
              lang={c.lang}
              timeZone={c.s['store.timeZone']}
            />
          ) : null}
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
