// PR 130 — the login page (demo 60-account.js PAGES.login, V12.2): the crumbs, "Log in" with the form on the left and
// the reasons to log in on the right (a computer: one card of two halves; a phone: one under the other). The demo's
// "Demo only — sample customer" box is not here: the real shop has no sample login (owner 19 Oct 21:33). Signed in
// already: "You are logged in" with the name and number, "Go to my account" and "Log out".
// The reasons say only what My account really does: the orders, the wishlist on every device, the wallet balance.
import './account.css';
import type { CustomerAuth } from '@extas/auth';
import type { ShopIcon } from '@extas/settings';
import type { ShopContext } from '@/lib/shop/context';
import { SHOP_DICTS, keysOf } from '@/lib/shop/dict';
import { waHref } from '@/lib/shop/links';
import { phoneNormalizeBD } from '@/lib/phone-bd';
import { Icon } from '../Icon';
import { AccountCrumbs } from './AccountShell';
import { LoginForm, type LoginWords } from './LoginForm';
import { LogoutButton } from './LogoutButton';

/** Every `account.login.*` and `account.err.*` word for the client form, slots like {store} filled. */
export function loginWords(c: ShopContext): LoginWords {
  return Object.fromEntries(
    keysOf(SHOP_DICTS[c.lang])
      .filter((k) => k.startsWith('account.login.') || k.startsWith('account.err.'))
      .map((k) => [k.slice('account.'.length), c.t(k, c.vars)]),
  );
}

export function LoginPage({ c, me, next, passwordOn, autoCreate }: { c: ShopContext; me: CustomerAuth | null; next: string; passwordOn: boolean; autoCreate: boolean }) {
  const t = c.t;
  if (me) {
    const p = phoneNormalizeBD(me.customer.phone ?? '');
    return (
      <div className="container acc-login" data-testid="login-page" data-signed-in="">
        <AccountCrumbs c={c} trail={[[t('account.login.title'), null]]} />
        <section className="card acc-login-card acc-in mt16">
          <div className="row" style={{ gap: 14 }}>
            <span className="ty-ic">
              <Icon name="user" size={20} />
            </span>
            <div>
              <h1 className="h2">{t('account.login.inTitle')}</h1>
              <div className="small text2">{[me.customer.name, p.ok ? p.nice : me.customer.phone].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <div className="row wrap mt16">
            <a className="btn btn-primary" href={next}>
              {t('account.login.go')}
            </a>
            <LogoutButton label={t('account.login.logout')} lang={c.lang} />
          </div>
        </section>
      </div>
    );
  }
  const wa = waHref(c.s['contact.whatsapp'], t('account.login.waMsg', c.vars));
  const ben: [ShopIcon, string, string][] = [
    ['truck', 'benOrders', 'benOrdersNote'],
    ['heart', 'benWish', 'benWishNote'],
    ['wallet', 'benWallet', 'benWalletNote'],
  ];
  return (
    <div className="container acc-login" data-testid="login-page">
      <AccountCrumbs c={c} trail={[[t('account.login.title'), null]]} />
      <div className="acc-login-grid">
        <section className="card acc-login-card" aria-labelledby="lg-h">
          <div className="eyebrow">{t('account.eyebrow')}</div>
          <h1 className="h1 mt8" id="lg-h">
            {t('account.login.title')}
          </h1>
          <p className="text2 small" style={{ margin: '6px 0 0' }}>
            {t('account.login.sub')}
          </p>
          <LoginForm words={loginWords(c)} lang={c.lang} next={next} wa={wa} passwordOn={passwordOn} />
          {autoCreate ? (
            <div className="acc-note mt16">
              <Icon name="info" size={17} />
              <span>{t('account.login.newHere')}</span>
            </div>
          ) : null}
        </section>
        <aside className="acc-login-side" aria-label={t('account.login.sideEyebrow')}>
          <div className="eyebrow" style={{ color: 'inherit', opacity: 0.75 }}>
            {t('account.login.sideEyebrow')}
          </div>
          <div className="display">{t('account.login.sideTitle')}</div>
          <ul className="acc-ben">
            {ben.map(([icon, b, s]) => (
              <li key={b}>
                <span className="i">
                  <Icon name={icon} size={17} />
                </span>
                <span>
                  <b>{t(`account.login.${b}`)}</b>
                  <span className="s">{t(`account.login.${s}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
