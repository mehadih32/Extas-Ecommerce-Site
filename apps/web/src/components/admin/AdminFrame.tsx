// PR 500 — the admin frame after the demo's adminShell (03-layout.js) and its language switch (98a-admin-lang.js):
// phone/tablet = dark top bar (store name · Admin · EN|বাং · Shop →) and the admin pages as chips; desktop (≥1024 px) =
// dark sidebar with the same pages, the System group and "Back to the shop". Only pages that exist are linked.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AdminView } from '@/lib/admin-page';
import { ADMIN_PAGES } from '@/lib/admin-nav';
import { t } from '@/lib/i18n';
import { Icon } from './Icon';
import { LangSwitch, type LangLabels } from './LangSwitch';
import { LogoutButton } from './LogoutButton';

export function langLabels(view: AdminView): LangLabels {
  const d = view.dict;
  return { group: t(d, 'frame.lang'), en: t(d, 'lang.en'), enShort: t(d, 'lang.enShort'), bn: t(d, 'lang.bn'), bnShort: t(d, 'lang.bnShort') };
}

export function Brand({ view, logo }: { view: AdminView; logo: 'side' | 'top' }) {
  return (
    <span className={logo === 'side' ? 'ad-side-brand' : 'ad-top-brand'}>
      {view.storeName ? (
        <span className="ad-logo" translate="no">
          {view.storeName}
        </span>
      ) : null}
      <span className="ad-tag">{t(view.dict, 'frame.admin')}</span>
    </span>
  );
}

export function AdminFrame({ view, current, children }: { view: AdminView; current: string; children: ReactNode }) {
  const d = view.dict;
  const labels = langLabels(view);
  const main = ADMIN_PAGES.filter((p) => p.group === 'main');
  const system = ADMIN_PAGES.filter((p) => p.group === 'system');
  const link = (p: (typeof ADMIN_PAGES)[number]) => (
    <Link key={p.key} href={p.href} aria-current={p.key === current ? 'page' : undefined}>
      <Icon name={p.icon} />
      {t(d, `nav.${p.key}`)}
    </Link>
  );
  return (
    <div className="ad" lang={view.lang}>
      <a className="ad-skip" href="#main">
        {t(d, 'frame.skip')}
      </a>
      <div className="ad-shell">
        <aside className="ad-side" aria-label={t(d, 'frame.nav')}>
          <Brand view={view} logo="side" />
          <LangSwitch current={view.lang} labels={labels} where="side" />
          {main.map(link)}
          {system.length ? <div className="ad-side-grp">{t(d, 'frame.system')}</div> : null}
          {system.map(link)}
          <div className="ad-side-foot">
            <Link href="/">
              <Icon name="back" />
              {t(d, 'frame.backToShop')}
            </Link>
            <LogoutButton label={t(d, 'frame.logout')} className="ad-side-btn" />
          </div>
        </aside>
        <div className="ad-col">
          <header className="ad-top">
            <Brand view={view} logo="top" />
            <LangSwitch current={view.lang} labels={labels} where="top" />
            <Link className="ad-top-shop" href="/">
              {t(d, 'frame.shop')}
            </Link>
          </header>
          <main className="ad-main" id="main" tabIndex={-1}>
            <LangSwitch current={view.lang} labels={labels} where="main" />
            <nav className="ad-mnav" aria-label={t(d, 'frame.nav')}>
              {ADMIN_PAGES.map((p) => (
                <Link key={p.key} className="ad-chip" href={p.href} aria-current={p.key === current ? 'page' : undefined}>
                  {t(d, `nav.${p.key}`)}
                </Link>
              ))}
            </nav>
            {children}
            <div className="ad-foot-m">
              <LogoutButton label={t(d, 'frame.logout')} className="ad-btn ad-btn-ghost ad-btn-sm" />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/** The strip of System pages at the top of each one (demo ZV_TABS); only pages that exist. */
export function SystemTabs({ view, current }: { view: AdminView; current: string }) {
  return (
    <nav className="ad-tabs" aria-label={t(view.dict, 'frame.systemTabs')}>
      {ADMIN_PAGES.filter((p) => p.group === 'system').map((p) => (
        <Link key={p.key} className="ad-chip" href={p.href} aria-current={p.key === current ? 'page' : undefined}>
          {t(view.dict, `nav.${p.key}`)}
        </Link>
      ))}
    </nav>
  );
}

/** A page that cannot be shown (no database, no permission): the frame stays, the reason in one line. */
export function AdminNotice({ view, current, text }: { view: AdminView; current: string; text: string }) {
  return (
    <AdminFrame view={view} current={current}>
      <div className="ad-note warn">
        <Icon name="info" size={16} />
        <div>{text}</div>
      </div>
    </AdminFrame>
  );
}
