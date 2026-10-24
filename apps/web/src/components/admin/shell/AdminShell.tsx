'use client';
// PR 12 (CN-018, CN-022) — the new admin's shell, after the approved demo V12.3 (#/admin, 97o-adm2-shell.js a2Shell):
//   - the deep-green sidebar: three headed groups and the bottom group (Settings, Help & Build) with the account chip;
//     at 768–1199 px it is an icon rail, on a phone it opens as a drawer from "More" or the menu button;
//   - the top bar: search (Ctrl/⌘ K, "/", or a tap), the bell, EN | বাং and the account menu;
//   - the phone's bottom bar: Home · Orders · Support · Search · More (Orders and Support only for those who see them);
//   - the panels: the search palette, notifications and the guide ("এই সেকশনে কী করা যায়").
// PR 594 (CN-026): a small help icon in the top bar opens the guide of the page the person is on (as a page's own guide
// button does); on a computer it is a side panel beside the page (the page moves over when there is room) and it
// follows the person to the next page; on a phone a full-screen sheet. `guideMode` is the person's choice of where it
// opens (CN-025's Settings → Admin look, a follow-up); none given is the side panel.
// Only sections the person may open are drawn; badges count waiting work they may open (GET /api/admin/shell/badges,
// asked again when a page changes and the count is older than the setting allows). The sign-in page has no shell.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react';
import type { AdminSectionId } from '@extas/settings';
import { ADMIN_LANG_COOKIE, ADMIN_LOGIN } from '@/lib/admin-nav';
import { resolveGuideMode } from '@/lib/admin-shell/help-pages';
import { viewerOf, type ShellModel } from '@/lib/admin-shell/model';
import { locate, sectionHome, sectionVisible, SHELL_GROUPS, SHELL_SECTIONS, type ShellSection } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { GUIDE_EVENT, PALETTE_EVENT, type GuideRequest } from './events';
import { GuidePanel } from './GuidePanel';
import { NotificationsDrawer } from './NotificationsDrawer';
import { Palette } from './Palette';
import { ShellIcon } from './ShellIcon';

const YEAR_SECONDS = 365 * 24 * 60 * 60;
type Pop = 'me' | 'me2' | null;

/** A phone's width (the shell's own phone break, shell.css): the guide opens as a full-screen sheet there. */
const PHONE = '(max-width: 767px)';
const onPhoneChange = (cb: () => void) => {
  const m = window.matchMedia(PHONE);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const isPhone = () => window.matchMedia(PHONE).matches;

export function AdminShell({ model, children, guideMode }: { model: ShellModel; children: ReactNode; guideMode?: string | null }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const [, start] = useTransition();
  const d = model.dict;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `shell.${k}`, vars);
  const viewer = useMemo(() => viewerOf(model), [model]);
  const [sb, setSb] = useState(false);
  const [pop, setPop] = useState<Pop>(null);
  const [ntf, setNtf] = useState(false);
  const [pal, setPal] = useState(false);
  const [guide, setGuide] = useState<GuideRequest | null>(null);
  const [badges, setBadges] = useState(model.badges);
  /** When the badges shown were counted (ms); set after the first paint, so the server's count is never refetched at once. */
  const counted = useRef(0);
  const opener = useRef<HTMLElement | null>(null);
  // A new count from the server replaces the shown one, and a new page closes what was open (state adjusted while
  // rendering, React's pattern for "reset when a prop changes", instead of setState inside an effect).
  const [seenBadges, setSeenBadges] = useState(model.badges);
  if (seenBadges !== model.badges) {
    setSeenBadges(model.badges);
    setBadges(model.badges);
  }
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setSb(false);
    setPop(null);
    // The side panel stays open and turns to the new page's guide (the person follows the steps across pages).
    if (guide?.path) setGuide({ ...guide, path: pathname });
  }
  const phone = useSyncExternalStore(onPhoneChange, isPhone, () => false);
  const mode = resolveGuideMode(guideMode, phone);

  const remember = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const restore = () => {
    const el = opener.current;
    opener.current = null;
    if (el && document.contains(el)) setTimeout(() => el.focus(), 0);
  };

  // The badges are counted again on a new page when the count has grown old.
  useEffect(() => {
    counted.current = Date.now();
  }, [model.badges]);
  useEffect(() => {
    if (Date.now() - counted.current < model.badgeSeconds * 1000) return;
    counted.current = Date.now();
    let live = true;
    fetch('/api/admin/shell/badges', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { badges?: Partial<Record<AdminSectionId, number>> } | null) => {
        if (live && j?.badges) setBadges(j.badges);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pathname, model.badgeSeconds]);

  const openPal = useCallback(() => {
    remember();
    setSb(false);
    setPop(null);
    setPal(true);
  }, []);

  // Ctrl/⌘ K anywhere, "/" when not typing, Esc closes menus and the drawer; pages ask through window events.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        openPal();
      } else if (ev.key === '/' && !typing && !document.querySelector('.a2-ov')) {
        ev.preventDefault();
        openPal();
      } else if (ev.key === 'Escape' && !document.querySelector('.a2-ov, .a2-drw')) {
        setPop(null);
        setSb(false);
      }
    };
    const onGuide = (ev: Event) => {
      remember();
      setGuide((ev as CustomEvent<GuideRequest>).detail);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(PALETTE_EVENT, openPal);
    window.addEventListener(GUIDE_EVENT, onGuide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PALETTE_EVENT, openPal);
      window.removeEventListener(GUIDE_EVENT, onGuide);
    };
  }, [openPal]);

  // A click outside an open menu closes it.
  useEffect(() => {
    if (!pop) return;
    const onDown = (ev: PointerEvent) => {
      const el = ev.target as HTMLElement | null;
      if (el?.closest('[data-a2pop]') || el?.closest('[data-a2pop-btn]')) return;
      setPop(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pop]);

  if (pathname === ADMIN_LOGIN || pathname.startsWith(`${ADMIN_LOGIN}/`)) return <>{children}</>;

  const here = locate(pathname);
  const active = here?.section.id ?? null;
  const visible = SHELL_SECTIONS.filter((s) => sectionVisible(s, viewer));
  const label = (s: ShellSection) => tt(`sec.${s.id}`);

  const item = (s: ShellSection) => {
    const n = badges[s.id] ?? 0;
    const on = active === s.id;
    return (
      <Link key={s.id} className={`a2-ni${on ? ' on' : ''}`} href={sectionHome(s, viewer)} aria-current={on ? 'page' : undefined} title={label(s)} onClick={() => setSb(false)}>
        <ShellIcon name={s.icon} />
        <span>{label(s)}</span>
        {n ? (
          <em className="a2-nb" aria-label={tt('nav.waiting', { n })}>
            {n}
          </em>
        ) : null}
      </Link>
    );
  };

  const openHere = () => {
    remember();
    setPop(null);
    setGuide({ path: pathname, section: here ? label(here.section) : '' });
  };

  const lang = (v: 'bn' | 'en') => {
    if (v === model.lang) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ADMIN_LANG_COOKIE}=${v}; Path=/admin; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
    start(() => router.refresh());
  };

  const signOut = async () => {
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      router.replace(ADMIN_LOGIN);
      router.refresh();
    }
  };

  const menu = (
    <div className="a2-menu" role="menu" aria-label={tt('me.menu')}>
      <div className="a2-mh">
        {model.me.name} · {model.me.role}
      </div>
      <a className="a2-mi" role="menuitem" href="/" target="_blank" rel="noopener">
        <ShellIcon name="store" size={16} />
        {tt('me.shop')}
      </a>
      <div className="a2-hr" role="separator" />
      <button type="button" className="a2-mi" role="menuitem" onClick={signOut} data-testid="a2-signout">
        <ShellIcon name="logout" size={16} />
        {tt('me.signOut')}
      </button>
    </div>
  );

  const orders = SHELL_SECTIONS.find((s) => s.id === 'orders')!;
  const support = SHELL_SECTIONS.find((s) => s.id === 'support')!;
  const bnav = (s: ShellSection, icon: 'bag' | 'headset') =>
    sectionVisible(s, viewer) ? (
      <Link href={sectionHome(s, viewer)} className={active === s.id ? 'on' : ''} aria-current={active === s.id ? 'page' : undefined}>
        <ShellIcon name={icon} size={21} />
        <span>{label(s)}</span>
        {badges[s.id] ? <em className="a2-nb">{badges[s.id]}</em> : null}
      </Link>
    ) : null;
  const brand = model.storeName ?? tt('admin');
  // Home is the Dashboard for whoever may open it; anyone else goes to /admin, which sends them to their start page.
  const dashboard = SHELL_SECTIONS[0]!;
  const homeHref = sectionVisible(dashboard, viewer) ? sectionHome(dashboard, viewer) : '/admin';

  return (
    <div className={`adm2${guide && mode === 'side' ? ' a2-gopen' : ''}`} translate="no" lang={model.lang} data-testid="a2-shell">
      <a className="a2-skip" href="#main">
        {tt('nav.skip')}
      </a>
      <aside className={`a2-sb a2-z${sb ? ' open' : ''}`} aria-label={tt('nav.aria')} data-testid="a2-sidebar">
        <div className="a2-brand">
          <span className="a2-logo" aria-hidden="true">
            {[...brand][0]}
          </span>
          <div>
            {/* letter-spacing breaks Bengali letters apart, so a Bengali name is set without it */}
            <div className="a2-wm" data-script={/[\u0980-\u09FF]/.test(brand) ? 'bn' : undefined}>
              {brand}
            </div>
            {model.storeName ? <div className="a2-wm-s">{tt('admin')}</div> : null}
          </div>
        </div>
        <nav className="a2-nav">
          {SHELL_GROUPS.map((g) => {
            const items = visible.filter((s) => s.group === g);
            return items.length ? (
              <div key={g} role="group" aria-label={tt(`groups.${g}`)}>
                <div className="a2-ng" aria-hidden="true">
                  {tt(`groups.${g}`)}
                </div>
                {items.map(item)}
              </div>
            ) : null;
          })}
        </nav>
        <div className="a2-sbf">
          {visible.filter((s) => s.group === 'bottom').map(item)}
          <button type="button" className="a2-me" data-a2pop-btn aria-haspopup="menu" aria-expanded={pop === 'me'} onClick={() => setPop(pop === 'me' ? null : 'me')} data-testid="a2-me">
            <span className="a2-av">{model.me.initials}</span>
            <span>
              <b>{model.me.name}</b>
              <i>{model.storeName ? `${model.me.role} · ${model.storeName}` : model.me.role}</i>
            </span>
            <ShellIcon name="cd" size={16} />
          </button>
          {pop === 'me' ? (
            <div className="a2-sbmenu" data-a2pop>
              {menu}
            </div>
          ) : null}
        </div>
      </aside>
      {sb ? <div className="a2-sbscrim" aria-hidden="true" onClick={() => setSb(false)} /> : null}
      <div className="a2-main">
        <header className="a2-tb a2-z">
          <button type="button" className="a2-icb a2-mbtn" aria-label={sb ? tt('nav.close') : tt('nav.open')} aria-expanded={sb} onClick={() => setSb(!sb)}>
            <ShellIcon name="menu" size={20} />
          </button>
          <button type="button" className="a2-srch" aria-label={tt('top.searchAria')} onClick={openPal} data-testid="a2-search">
            <ShellIcon name="search" size={17} />
            <span className="a2-sl">{tt('top.search')}</span>
            <span className="a2-ss">{tt('top.searchShort')}</span>
            <kbd>{tt('top.kbd')}</kbd>
          </button>
          <div className="a2-tbr">
            {model.storeName ? (
              <span className="a2-storetb a2-hm">
                <ShellIcon name="store" size={15} />
                {model.storeName}
              </span>
            ) : null}
            <button type="button" className="a2-icb a2-help" aria-label={tt('top.guide')} title={tt('top.guide')} aria-expanded={!!guide} onClick={() => (guide ? setGuide(null) : openHere())} data-testid="a2-help">
              <ShellIcon name="help" size={19} />
            </button>
            <button
              type="button"
              className="a2-icb"
              aria-label={tt('top.bell')}
              onClick={() => {
                remember();
                setPop(null);
                setNtf(true);
              }}
              data-testid="a2-bell"
            >
              <ShellIcon name="bell" size={19} />
            </button>
            <div className="a2-lang" role="group" aria-label={model.langLabels.group}>
              <button type="button" className={model.lang === 'en' ? 'on' : ''} aria-pressed={model.lang === 'en'} lang="en" onClick={() => lang('en')}>
                {model.langLabels.enShort}
                <span className="a2-sr"> · {model.langLabels.en}</span>
              </button>
              <button type="button" className={model.lang === 'bn' ? 'on' : ''} aria-pressed={model.lang === 'bn'} lang="bn" onClick={() => lang('bn')}>
                {model.langLabels.bnShort}
                <span className="a2-sr"> · {model.langLabels.bn}</span>
              </button>
            </div>
            <button type="button" className="a2-icb a2-hm" data-a2pop-btn aria-label={tt('top.account')} aria-haspopup="menu" aria-expanded={pop === 'me2'} onClick={() => setPop(pop === 'me2' ? null : 'me2')} data-testid="a2-avatar">
              <span className="a2-av g">{model.me.initials}</span>
            </button>
          </div>
          {pop === 'me2' ? (
            <div className="a2-tbpop" data-a2pop>
              {menu}
            </div>
          ) : null}
        </header>
        <main className="a2-ct" id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <nav className="a2-bnav a2-z" aria-label={tt('nav.quick')}>
        <Link href={homeHref} className={active === 'dashboard' ? 'on' : ''} aria-current={active === 'dashboard' ? 'page' : undefined}>
          <ShellIcon name="home" size={21} />
          <span>{tt('nav.home')}</span>
        </Link>
        {bnav(orders, 'bag')}
        {bnav(support, 'headset')}
        <button type="button" onClick={openPal}>
          <ShellIcon name="search" size={21} />
          <span>{tt('nav.search')}</span>
        </button>
        <button type="button" aria-expanded={sb} onClick={() => setSb(!sb)}>
          <ShellIcon name="menu" size={21} />
          <span>{tt('nav.more')}</span>
        </button>
      </nav>
      {ntf ? (
        <NotificationsDrawer
          dict={d}
          onClose={() => {
            setNtf(false);
            restore();
          }}
        />
      ) : null}
      {guide ? (
        <GuidePanel
          dict={d}
          request={guide}
          mode={mode}
          here={pathname}
          onOpen={(g) => setGuide(g)}
          onClose={() => {
            setGuide(null);
            restore();
          }}
        />
      ) : null}
      {pal ? (
        <Palette
          dict={d}
          onGuide={(g) => setGuide(g)}
          onClose={() => {
            setPal(false);
            restore();
          }}
        />
      ) : null}
    </div>
  );
}
