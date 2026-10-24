'use client';
// PR 12 (CN-018, CN-022) — the new admin's shell; PR 12 (CN-025) — redrawn in the V12.4 design language (demo
// 97z-adm2-rd1-core.js a3Shell, the owner's mock-ups):
//   - the deep-green top bar (56 px): menu (tablet/phone), the store's initial and name, the store chip, search (Ctrl/⌘ K,
//     "/" or a tap), "View shop", the "To do" tray (a dot while lists wait; T opens it), the bell, EN | বাং, the account;
//   - the icon rail (64 px) of the sections the person may open: a hover or focus fly-out with the section's pages, the
//     open section's pages under it when the rail is expanded (232 px, the person's own choice, kept in a cookie); on a
//     tablet and a phone the rail opens as a drawer from the menu button or "More";
//   - the phone's bottom bar: Home · Orders · Products · To do · More (Orders and Products only for those who see them);
//   - the panels: the search palette, notifications, the guide and the "To do" drawer; the charts' hover tip.
// PR 594 (CN-026): a small help icon in the top bar opens the guide of the page the person is on (as a page's own guide
// button does); on a computer it is a side panel beside the page (the page moves over when there is room) and it
// follows the person to the next page; on a phone a full-screen sheet. `guideMode` is the person's choice of where it
// opens (Settings → Admin look, `admin.guideOpens`, read by the layout); none given is the side panel.
// No badges on the rail (V12.4): waiting work lives in the "To do" drawer, counted again when a page changes and the
// count is older than `admin.shell.badgeCacheSeconds` (GET /api/admin/shell/badges). The sign-in page has no shell.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type ReactNode } from 'react';
import { ADMIN_LANG_COOKIE, ADMIN_LOGIN } from '@/lib/admin-nav';
import { resolveGuideMode } from '@/lib/admin-shell/help-pages';
import { RAIL_COOKIE, viewerOf, type ShellModel, type TodoItem } from '@/lib/admin-shell/model';
import { locate, sectionHome, sectionVisible, SHELL_GROUPS, SHELL_SECTIONS, visiblePages, visibleTabs, type ShellSection } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { ChartTips } from '../look/ChartTips';
import { GUIDE_EVENT, PALETTE_EVENT, TODO_EVENT, type GuideRequest } from './events';
import { GuidePanel } from './GuidePanel';
import { NotificationsDrawer } from './NotificationsDrawer';
import { Palette } from './Palette';
import { ShellIcon } from './ShellIcon';
import { readLater, TodoDrawer } from './TodoDrawer';

const YEAR_SECONDS = 365 * 24 * 60 * 60;
type Pop = 'me' | 'me2' | null;

const typingIn = (el: HTMLElement | null) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

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
  const [exp, setExp] = useState(model.railExpanded);
  const [pop, setPop] = useState<Pop>(null);
  const [ntf, setNtf] = useState(false);
  const [pal, setPal] = useState(false);
  const [todoAt, setTodoAt] = useState<number | null>(null);
  const [later, setLater] = useState<Record<string, number>>({});
  const [guide, setGuide] = useState<GuideRequest | null>(null);
  const [todo, setTodo] = useState<TodoItem[]>(model.todo);
  const [fly, setFly] = useState<{ id: string; style: CSSProperties } | null>(null);
  /** When the lists shown were counted (ms); set after the first paint, so the server's count is never refetched at once. */
  const counted = useRef(0);
  const opener = useRef<HTMLElement | null>(null);
  // A new count from the server replaces the shown one, and a new page closes what was open (state adjusted while
  // rendering, React's pattern for "reset when a prop changes", instead of setState inside an effect).
  const [seenTodo, setSeenTodo] = useState(model.todo);
  if (seenTodo !== model.todo) {
    setSeenTodo(model.todo);
    setTodo(model.todo);
  }
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setSb(false);
    setPop(null);
    setFly(null);
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

  // The waiting lists are counted again on a new page when the count has grown old.
  useEffect(() => {
    counted.current = Date.now();
  }, [model.todo]);
  useEffect(() => {
    if (Date.now() - counted.current < model.badgeSeconds * 1000) return;
    counted.current = Date.now();
    let live = true;
    fetch('/api/admin/shell/badges', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { todo?: TodoItem[] } | null) => {
        if (live && Array.isArray(j?.todo)) setTodo(j.todo);
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
  const openTodoNow = useCallback(() => {
    remember();
    setSb(false);
    setPop(null);
    setNtf(false);
    const now = Date.now();
    setLater(readLater(now));
    setTodoAt(now);
  }, []);

  // Ctrl/⌘ K anywhere, "/" when not typing, T opens "To do", Esc closes menus and the drawer; pages ask through events.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      const typing = typingIn(el);
      const overlay = !!document.querySelector('.a2-ov, .a2-drw');
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        openPal();
      } else if (ev.key === '/' && !typing && !document.querySelector('.a2-ov')) {
        ev.preventDefault();
        openPal();
      } else if ((ev.key === 't' || ev.key === 'T') && !typing && !overlay && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ev.preventDefault();
        openTodoNow();
      } else if (ev.key === 'Escape' && !overlay) {
        setPop(null);
        setSb(false);
        setFly(null);
      }
    };
    const onGuide = (ev: Event) => {
      remember();
      setGuide((ev as CustomEvent<GuideRequest>).detail);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(PALETTE_EVENT, openPal);
    window.addEventListener(TODO_EVENT, openTodoNow);
    window.addEventListener(GUIDE_EVENT, onGuide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PALETTE_EVENT, openPal);
      window.removeEventListener(TODO_EVENT, openTodoNow);
      window.removeEventListener(GUIDE_EVENT, onGuide);
    };
  }, [openPal, openTodoNow]);

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
  const tabsOf = (s: ShellSection) => visibleTabs(s, viewer).map((tb) => ({ id: tb.id, href: visiblePages(tb, viewer)[0]!.href, label: tt(`tab.${s.id}.${tb.id}`) }));
  const railOpen = !exp && !sb;
  const openHere = () => {
    remember();
    setPop(null);
    setGuide({ path: pathname, section: here ? label(here.section) : '' });
  };

  // The fly-out sits beside its icon (the rail itself may scroll), placed when the pointer or focus arrives.
  const showFly = (id: string, el: HTMLElement) => {
    if (!railOpen) return;
    const r = el.getBoundingClientRect();
    setFly({ id, style: { top: Math.max(8, Math.min(r.top, window.innerHeight - 220)), left: r.right + 4 } });
  };

  const item = (s: ShellSection) => {
    const on = active === s.id;
    const tabs = tabsOf(s);
    const name = label(s);
    return (
      <div
        key={s.id}
        className={`a3-nw${on ? ' on' : ''}${fly?.id === s.id ? ' fly' : ''}`}
        onPointerEnter={(ev) => ev.pointerType === 'mouse' && showFly(s.id, ev.currentTarget)}
        onPointerLeave={(ev) => ev.pointerType === 'mouse' && setFly((f) => (f?.id === s.id ? null : f))}
        onFocus={(ev) => showFly(s.id, ev.currentTarget)}
        onBlur={(ev) => !ev.currentTarget.contains(ev.relatedTarget as Node | null) && setFly((f) => (f?.id === s.id ? null : f))}
      >
        <Link className={`a3-ni${on ? ' on' : ''}`} href={sectionHome(s, viewer)} aria-current={on ? 'page' : undefined} aria-label={name} onClick={() => (setSb(false), setFly(null))} data-testid={`a3-nav-${s.id}`}>
          <ShellIcon name={s.icon} size={19} />
          <span className="a3-nl">{name}</span>
        </Link>
        {railOpen && fly?.id === s.id ? (
          <div className="a3-fly" style={fly.style}>
            <Link className="a3-flyh" href={sectionHome(s, viewer)} onClick={() => setFly(null)} tabIndex={-1}>
              {name}
            </Link>
            {tabs.length > 1
              ? tabs.map((tb) => (
                  <Link key={tb.id} href={tb.href} onClick={() => setFly(null)}>
                    {tb.label}
                  </Link>
                ))
              : null}
          </div>
        ) : null}
        {on && tabs.length > 1 ? (
          <div className="a3-rsub">
            {tabs.map((tb) => {
              const ton = here?.tab?.id === tb.id;
              return (
                <Link key={tb.id} href={tb.href} className={ton ? 'on' : ''} aria-current={ton ? 'page' : undefined} onClick={() => setSb(false)}>
                  {tb.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const lang = (v: 'bn' | 'en') => {
    if (v === model.lang) return;
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ADMIN_LANG_COOKIE}=${v}; Path=/admin; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
    start(() => router.refresh());
  };

  const toggleRail = () => {
    const next = !exp;
    setExp(next);
    setFly(null);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${RAIL_COOKIE}=${next ? '1' : '0'}; Path=/admin; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
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

  const brand = model.storeName ?? tt('admin');
  const bnScript = /[ঀ-৿]/.test(brand) ? 'bn' : undefined;
  // Home is the Dashboard for whoever may open it; anyone else goes to /admin, which sends them to their start page.
  const dashboard = SHELL_SECTIONS[0]!;
  const homeHref = sectionVisible(dashboard, viewer) ? sectionHome(dashboard, viewer) : '/admin';
  const waiting = todo.length;
  const bn = (s: ShellSection | undefined, icon: 'bag' | 'shirt') =>
    s && sectionVisible(s, viewer) ? (
      <Link href={sectionHome(s, viewer)} className={active === s.id ? 'on' : ''} aria-current={active === s.id ? 'page' : undefined}>
        <ShellIcon name={icon} size={21} />
        <span>{label(s)}</span>
      </Link>
    ) : null;

  return (
    <div className={`adm2 a3s${guide && mode === 'side' ? ' a2-gopen' : ''}`} translate="no" lang={model.lang} data-testid="a2-shell">
      <a className="a2-skip" href="#main">
        {tt('nav.skip')}
      </a>
      <header className="a3-tb a2-z">
        <button type="button" className="a3-tbi a3-mb" aria-label={sb ? tt('nav.close') : tt('nav.open')} aria-expanded={sb} onClick={() => setSb(!sb)}>
          <ShellIcon name="menu" size={20} />
        </button>
        <Link className="a3-brand" href={homeHref} aria-label={tt('top.home')}>
          <span className="a3-logo" aria-hidden="true">
            {[...brand][0]}
          </span>
          <span className="a3-wm" data-script={bnScript}>
            {brand}
          </span>
        </Link>
        {model.storeName ? (
          <span className="a3-store" title={tt('top.storeTitle')}>
            <ShellIcon name="store" size={15} />
            <b>{model.storeName}</b>
          </span>
        ) : null}
        <button type="button" className="a3-srch" aria-label={tt('top.searchAria')} onClick={openPal} data-testid="a2-search">
          <ShellIcon name="search" size={16} />
          <span>
            <span className="a3-srl">{tt('top.searchV4')}</span>
            <span className="a3-srs">{tt('top.searchShort')}</span>
          </span>
          <kbd>{tt('top.kbd')}</kbd>
        </button>
        <div className="a3-tbr">
          <a className="a3-shop" href="/" target="_blank" rel="noopener" title={tt('top.shopTitle')}>
            <ShellIcon name="ext" size={15} />
            <span>{tt('top.shop')}</span>
          </a>
          <button type="button" className={`a3-tbi${guide ? ' on' : ''}`} aria-label={tt('top.guide')} title={tt('top.guide')} aria-expanded={!!guide} onClick={() => (guide ? setGuide(null) : openHere())} data-testid="a2-help">
            <ShellIcon name="help" size={19} />
          </button>
          <button type="button" className={`a3-tbi${todoAt !== null ? ' on' : ''}`} aria-label={waiting ? tt('top.todoWaiting', { n: waiting }) : tt('top.todo')} title={tt('top.todoTitle')} onClick={openTodoNow} data-testid="a3-todo">
            <ShellIcon name="inbox" size={19} />
            {waiting ? <i className="a3-dot" aria-hidden="true" /> : null}
          </button>
          <button
            type="button"
            className="a3-tbi"
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
          <div className="a3-lang" role="group" aria-label={model.langLabels.group}>
            <button type="button" className={model.lang === 'en' ? 'on' : ''} aria-pressed={model.lang === 'en'} lang="en" onClick={() => lang('en')}>
              {model.langLabels.enShort}
              <span className="a2-sr"> · {model.langLabels.en}</span>
            </button>
            <button type="button" className={model.lang === 'bn' ? 'on' : ''} aria-pressed={model.lang === 'bn'} lang="bn" onClick={() => lang('bn')}>
              {model.langLabels.bnShort}
              <span className="a2-sr"> · {model.langLabels.bn}</span>
            </button>
          </div>
          <button type="button" className="a3-av" data-a2pop-btn aria-label={`${tt('top.account')} · ${model.me.name}`} aria-haspopup="menu" aria-expanded={pop === 'me2'} onClick={() => setPop(pop === 'me2' ? null : 'me2')} data-testid="a2-avatar">
            {model.me.initials}
          </button>
        </div>
        {pop === 'me2' ? (
          <div className="a2-tbpop a3-tbpop" data-a2pop>
            {menu}
          </div>
        ) : null}
      </header>
      <div className={`a3-body${exp ? ' exp' : ''}`}>
        <aside className={`a3-rail a2-z${exp ? ' exp' : ''}${sb ? ' open' : ''}`} aria-label={tt('nav.aria')} data-testid="a2-sidebar">
          {sb ? (
            <div className="a3-rbrand">
              <span className="a3-logo" aria-hidden="true">
                {[...brand][0]}
              </span>
              <b data-script={bnScript}>{brand}</b>
              <button type="button" className="a3-btn ic gh" aria-label={tt('nav.close')} onClick={() => setSb(false)}>
                <ShellIcon name="x" size={18} />
              </button>
            </div>
          ) : null}
          <nav className="a3-nav">
            {SHELL_GROUPS.map((g) => {
              const items = visible.filter((s) => s.group === g);
              return items.length ? (
                <div key={g} role="group" aria-label={tt(`groups.${g}`)} className="a3-ngw">
                  <div className="a3-ng" aria-hidden="true" />
                  {items.map(item)}
                </div>
              ) : null;
            })}
          </nav>
          <div className="a3-rfoot">
            {visible.filter((s) => s.group === 'bottom').map(item)}
            {sb ? (
              <div className="a3-racc">
                <button type="button" className="a2-me" data-a2pop-btn aria-haspopup="menu" aria-expanded={pop === 'me'} onClick={() => setPop(pop === 'me' ? null : 'me')} data-testid="a2-me">
                  <span className="a2-av">{model.me.initials}</span>
                  <span>
                    <b>{model.me.name}</b>
                    <i>{model.storeName ? `${model.me.role} · ${model.storeName}` : model.me.role}</i>
                  </span>
                  <ShellIcon name="cd" size={16} />
                </button>
                {pop === 'me' ? <div data-a2pop>{menu}</div> : null}
              </div>
            ) : null}
            <button type="button" className="a3-ni a3-rtog" aria-pressed={exp} aria-label={exp ? tt('nav.collapse') : tt('nav.expand')} title={exp ? tt('nav.collapse') : tt('nav.expand')} onClick={toggleRail} data-testid="a3-rail-toggle">
              <ShellIcon name="rail" size={19} />
              <span className="a3-nl">{exp ? tt('nav.collapseShort') : tt('nav.expandShort')}</span>
            </button>
          </div>
        </aside>
        {sb ? <div className="a3-scrim" aria-hidden="true" onClick={() => setSb(false)} /> : null}
        <main className="a2-ct a3-ct" id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <nav className="a2-bnav a3-bnav a2-z" aria-label={tt('nav.quick')}>
        <Link href={homeHref} className={active === 'dashboard' ? 'on' : ''} aria-current={active === 'dashboard' ? 'page' : undefined}>
          <ShellIcon name="home" size={21} />
          <span>{tt('nav.home')}</span>
        </Link>
        {bn(SHELL_SECTIONS.find((s) => s.id === 'orders'), 'bag')}
        {bn(SHELL_SECTIONS.find((s) => s.id === 'products'), 'shirt')}
        <button type="button" className={todoAt !== null ? 'on' : ''} onClick={openTodoNow} aria-label={waiting ? tt('top.todoWaiting', { n: waiting }) : tt('top.todo')}>
          <ShellIcon name="inbox" size={21} />
          <span>{tt('nav.todo')}</span>
          {waiting ? <i className="a3-dot" aria-hidden="true" /> : null}
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
      {todoAt !== null ? (
        <TodoDrawer
          dict={d}
          items={todo}
          mine={model.todoMine}
          laterHours={model.laterHours}
          later={later}
          setLater={setLater}
          now={todoAt}
          onClose={() => {
            setTodoAt(null);
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
      <ChartTips />
    </div>
  );
}
