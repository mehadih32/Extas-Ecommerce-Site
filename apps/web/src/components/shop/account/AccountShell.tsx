// PR 131 — the frame of every My account section (demo 60-account.js PAGES.account, acc_side, acc_header, acc_chips,
// acc_homeRow, V12.2): the crumbs; on a computer the side menu (the round picture with the name, the sections with
// their counts, "Log out", and the WhatsApp help under it); the header card ("Hi, Rahim", the number, and the figures:
// orders, wallet, saved); on a phone the sections as a row of chips; the section itself; then the way home ("Back to
// home", "Keep shopping", "Log out"). Only the sections the owner shows (`account.tabs`), in his order.
// The demo's tier tag ("VIP", "New customer") and the "Offers" figure wait for the systems that make them true.
import '../bag/bag.css';
import './account.css';
import type { ReactNode } from 'react';
import { initialsOf } from '@extas/accounts/pure';
import type { AccountTab } from '@extas/settings';
import type { ShopIcon } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import { tabHref, type AccountPage } from '@/lib/shop/account-view';
import { hrefIn } from '@/lib/shop/lang';
import { waHref } from '@/lib/shop/links';
import { ROUTES } from '@/lib/shop/routes';
import { Icon, WaGlyph } from '../Icon';
import { LogoutButton } from './LogoutButton';

const TAB_ICON: Record<AccountTab, ShopIcon> = { orders: 'box', foryou: 'spark', rewards: 'gift', wallet: 'wallet', wishlist: 'heart', profile: 'user' };

export function Avatar({ name, small = false }: { name: string | null; small?: boolean }) {
  const ini = initialsOf(name);
  return (
    <span className={`acc-avatar${small ? ' sm' : ''}`} data-acc-avatar="">
      {ini ? ini : <Icon name="user" size={small ? 18 : 22} />}
    </span>
  );
}

export function AccountCrumbs({ c, trail }: { c: ShopContext; trail: [string, string | null][] }) {
  return (
    <nav className="crumbs" aria-label={c.t('account.crumbs')}>
      <a href={hrefIn(c.lang, ROUTES.home)}>{c.t('account.home')}</a>
      {trail.map(([label, href], i) => {
        const last = i === trail.length - 1;
        return (
          <span key={label} style={{ display: 'contents' }}>
            <span aria-hidden="true">/</span>
            {href && !last ? <a href={href}>{label}</a> : <span aria-current={last ? 'page' : undefined}>{label}</span>}
          </span>
        );
      })}
    </nav>
  );
}

/** The way home at the end of every section (demo R13 note 47). */
export function HomeRow({ c }: { c: ShopContext }) {
  return (
    <div className="acc-home" data-testid="acc-home">
      <a className="btn btn-secondary btn-block" href={hrefIn(c.lang, ROUTES.home)}>
        <Icon name="home" size={17} />
        {c.t('account.backHome')}
      </a>
      <a className="btn btn-ghost btn-block" href={hrefIn(c.lang, ROUTES.newIn)}>
        <Icon name="bag" size={17} />
        {c.t('account.keepShopping')}
      </a>
      <LogoutButton label={c.t('account.logout')} lang={c.lang} className="btn btn-ghost btn-block" icon />
    </div>
  );
}

export function AccountShell({ c, page, tab, children }: { c: ShopContext; page: AccountPage; tab: AccountTab; children: ReactNode }) {
  const t = c.t;
  const { summary: s, tabs } = page;
  const label = (x: AccountTab) => t(`account.tabs.${x}`);
  const counts: Partial<Record<AccountTab, string>> = {
    orders: c.num(s.orders),
    ...(s.walletMinor !== null ? { wallet: c.money(s.walletMinor) } : {}),
    ...(page.wishCount > 0 ? { wishlist: c.num(page.wishCount) } : {}),
  };
  const wa = waHref(c.s['contact.whatsapp'], t('account.helpMsg', c.vars));
  const name = s.firstName ? t('account.hi', { name: s.firstName }) : t('account.hiNoName');
  const trail: [string, string | null][] = [[t('account.title'), hrefIn(c.lang, ROUTES.account)]];
  if (tab !== 'orders') trail.push([label(tab), null]);
  return (
    <div className="container acc-page" data-testid="account-page" data-tab={tab}>
      <AccountCrumbs c={c} trail={trail} />
      <div className="acc-layout">
        <aside className="acc-side" aria-label={t('account.menu')}>
          <div className="acc-side-card">
            <div className="acc-side-top">
              <Avatar name={s.name} small />
              <div style={{ minWidth: 0 }}>
                <div className="bold acc-ellipsis">{s.name || s.phone}</div>
                {s.name ? <div className="xs muted">{s.phone}</div> : null}
              </div>
            </div>
            <nav className="acc-nav">
              {tabs.map((x) => {
                const on = x === tab;
                return (
                  <a key={x} href={tabHref(c, x)} className={on ? 'on' : undefined} aria-current={on ? 'page' : undefined} data-testid={`acc-nav-${x}`}>
                    <Icon name={TAB_ICON[x]} size={18} />
                    <span>{label(x)}</span>
                    {counts[x] ? <span className="acc-n">{counts[x]}</span> : null}
                  </a>
                );
              })}
            </nav>
            <div className="acc-side-foot">
              <LogoutButton label={t('account.logout')} lang={c.lang} className="acc-logout" icon />
            </div>
          </div>
          {wa ? (
            <a className="btn btn-secondary btn-block mt16 acc-sidewa" href={wa} target="_blank" rel="noopener noreferrer">
              <WaGlyph size={18} />
              {t('account.help')}
            </a>
          ) : null}
        </aside>
        <div className="stack s16 acc-main">
          <section className="card acc-hd" aria-label={t('account.summary')}>
            <div className="acc-hd-id">
              <Avatar name={s.name} />
              <div style={{ minWidth: 0 }}>
                <h1 className="h1 acc-hi">{name}</h1>
                <div className="small text2" style={{ marginTop: 4 }}>
                  {s.phone}
                </div>
              </div>
            </div>
            <div className="acc-stats">
              <a className="acc-stat" href={tabHref(c, 'orders')} data-testid="acc-stat-orders">
                <span className="v">{c.num(s.orders)}</span>
                <span className="k">{t('account.stat.orders')}</span>
              </a>
              {tabs.includes('wallet') ? (
                <a className="acc-stat" href={tabHref(c, 'wallet')} data-testid="acc-stat-wallet">
                  <span className="v">{c.money(s.walletMinor ?? 0)}</span>
                  <span className="k">{t('account.stat.wallet')}</span>
                </a>
              ) : null}
              {tabs.includes('wishlist') ? (
                <a className="acc-stat" href={tabHref(c, 'wishlist')} data-testid="acc-stat-saved">
                  <span className="v">{c.num(page.wishCount)}</span>
                  <span className="k">{t('account.stat.saved')}</span>
                </a>
              ) : null}
            </div>
          </section>
          <nav className="scroll-x hide-d acc-chips" aria-label={t('account.sections')}>
            {tabs.map((x) => (
              <a key={x} className={`chip${x === tab ? ' on' : ''}`} href={tabHref(c, x)} aria-current={x === tab ? 'page' : undefined}>
                {label(x)}
              </a>
            ))}
          </nav>
          {children}
          <HomeRow c={c} />
        </div>
      </div>
    </div>
  );
}

/** Signed out (or the session ran out): log in, then come back here (demo acc_loginPrompt). */
export function LoginPrompt({ c, here, autoCreate }: { c: ShopContext; here: string; autoCreate: boolean }) {
  const t = c.t;
  return (
    <div className="container acc-page" data-testid="account-prompt">
      <AccountCrumbs c={c} trail={[[t('account.title'), null]]} />
      <section className="card acc-prompt mt16">
        <span className="acc-prompt-i">
          <Icon name="lock" size={24} />
        </span>
        <h1 className="h2">{t('account.prompt.title')}</h1>
        <p className="text2 small">{t('account.prompt.text')}</p>
        <a className="btn btn-primary" href={`${hrefIn(c.lang, ROUTES.login)}?next=${encodeURIComponent(here)}`} data-testid="account-prompt-login">
          <Icon name="user" size={17} />
          {t('account.prompt.button')}
        </a>
        {autoCreate ? <p className="xs muted acc-prompt-new">{t('account.login.newHere')}</p> : null}
      </section>
    </div>
  );
}
