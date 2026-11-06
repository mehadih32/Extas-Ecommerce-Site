'use client';
// PR 12 (CN-018, CN-022) — the new admin's shell; PR 12 (CN-025) — redrawn in the V12.4 design language.
// PR 626 (CN-036) — redrawn as the Lumen shell (docs/demo/admin-look/LUMEN-SPEC.md §2, ADMIN-LOOKS-V1.html ঘ):
//   - a floating sidebar (248 px, inset 12 px, rounded) in the groups Daily, Grow, Business, System (lumen-nav.ts): the
//     store's mark and name, the search box (the command palette), the sections the person may open with their badges
//     (what waits: orders to act on, open support items …), the current section's pages as an accordion under it (the
//     chevron opens another section's pages without leaving the page), the account at the foot; the collapse button
//     makes it icons only (72 px, the person's own choice in a cookie) with a fly-out of the section's pages on hover
//     or focus; below 900 px it is icons only by itself; below 760 px it becomes a bottom bar that scrolls sideways
//     with every section reachable;
//   - a slim top bar: search (when the sidebar's box is hidden), "To do" (T), the page's guide, EN | বাং, the moon
//     (light / dark, kept on the person's account) and the bell (the notifications panel: unread count, each note
//     opens its page, "Mark all read"); the account on a phone;
//   - sub-pages also show as tabs under each page's title (ShellParts SectionTabs, drawn in the look by lumen-shell.css);
//   - the panels: the command palette (Ctrl/⌘ K or "/": pages, actions, orders, products, customers — only what the
//     person may open), "To do", the guide, the notifications; Esc closes each.
//   - the AI Center and the round assistant button show only while S15 is open and AI is on (stages.ts); while the
//     owner keeps S15 closed both are hidden (CN-036), and the assistant comes with S15: it drafts and never sends.
// PR 594 (CN-026): the guide opens as a side panel beside the page on a computer (it follows the person to the next
// page), a full-screen sheet on a phone; `guideMode` is the person's choice (Settings → Admin look).
// The waiting lists are counted again when a page changes and the count is older than `admin.shell.badgeCacheSeconds`
// (GET /api/admin/shell/badges). The sign-in page has no shell.
// PR 627 (CN-036): the shell provides the shared Lumen patterns' words and numbers (LumenProvider) and mounts the one
// toast (ToastHost; any admin screen calls showToast).
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type ReactNode } from 'react';
import { ADMIN_LANG_COOKIE, ADMIN_LOGIN } from '@/lib/admin-nav';
import { DEFAULT_THEME, themeAttrs, themeOnRoot, themeStyle, type ThemeMode } from '@/lib/admin-look/theme';
import { resolveGuideMode } from '@/lib/admin-shell/help-pages';
import { lumenNav } from '@/lib/admin-shell/lumen-nav';
import { RAIL_COOKIE, viewerOf, type ShellModel, type TodoItem } from '@/lib/admin-shell/model';
import { locate, sectionHome, sectionVisible, SHELL_SECTIONS, visiblePages, visibleTabs, type ShellSection } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { ChartTips } from '../look/ChartTips';
import { LUMEN_DEFAULTS, LumenProvider } from '../lumen/context';
import { ToastHost } from '../lumen/Toast';
import { GUIDE_EVENT, PALETTE_EVENT, TODO_EVENT, type GuideRequest } from './events';
import { GuidePanel } from './GuidePanel';
import { NotificationsPanel, noteUnread, type ShellNote } from './NotificationsPanel';
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

const cookie = (name: string, value: string) => {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; Path=/admin; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secure}`;
};

/** One person's own choice, kept on their staff account (PUT /api/admin/look, scope "me"); a failure keeps the screen. */
const saveMine = (body: Record<string, unknown>) =>
  fetch('/api/admin/look', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'me', ...body }) }).catch(() => undefined);

export function AdminShell({ model, children, guideMode }: { model: ShellModel; children: ReactNode; guideMode?: string | null }) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  const [, start] = useTransition();
  const d = model.dict;
  // PR 627 (CN-036): the shared patterns' words and numbers (components/admin/lumen/context.tsx).
  const lumen = useMemo(() => ({ dict: d, undoSeconds: model.patterns?.undoSeconds ?? LUMEN_DEFAULTS.undoSeconds, pageStep: model.patterns?.pageStep ?? LUMEN_DEFAULTS.pageStep }), [d, model.patterns]);
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `shell.${k}`, vars);
  const viewer = useMemo(() => viewerOf(model), [model]);
  const [col, setCol] = useState(!model.railExpanded);
  const [pop, setPop] = useState<Pop>(null);
  const [ntf, setNtf] = useState(false);
  const [notes, setNotes] = useState<ShellNote[] | null>(null);
  const [seen, setSeen] = useState<string | null>(model.notesSeenAt ?? null);
  const [pal, setPal] = useState(false);
  const [todoAt, setTodoAt] = useState<number | null>(null);
  const [later, setLater] = useState<Record<string, number>>({});
  const [guide, setGuide] = useState<GuideRequest | null>(null);
  const [todo, setTodo] = useState<TodoItem[]>(model.todo);
  const [fly, setFly] = useState<{ id: string; style: CSSProperties } | null>(null);
  const [openSec, setOpenSec] = useState<string | null>(null);
  const [mode, setMode] = useState<ThemeMode>(model.theme?.mode ?? 'light');
  // PR 630: light or dark chosen on Settings › Admin look arrives with the redrawn model; follow it (the moon keeps
  // its own instant switch).
  const [modeFromServer, setModeFromServer] = useState(model.theme?.mode ?? 'light');
  if ((model.theme?.mode ?? 'light') !== modeFromServer) {
    setModeFromServer(model.theme?.mode ?? 'light');
    setMode(model.theme?.mode ?? 'light');
  }
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
    setPop(null);
    setFly(null);
    setNtf(false);
    setOpenSec(null);
    // The side panel stays open and turns to the new page's guide (the person follows the steps across pages).
    if (guide?.path) setGuide({ ...guide, path: pathname });
  }
  const phone = useSyncExternalStore(onPhoneChange, isPhone, () => false);
  const guideAs = resolveGuideMode(guideMode, phone);
  // PR 625/626 (CN-036): the person's theme on the shell's root (server-drawn, no flash) and on <html> for the dialogs;
  // the moon changes it at once and keeps it on their account.
  const theme = useMemo(() => ({ ...(model.theme ?? DEFAULT_THEME), mode }), [model.theme, mode]);
  useEffect(() => themeOnRoot(theme), [theme]);

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

  // The bell's notes: read once when the shell opens (the unread count) and again each time the panel opens.
  const loadNotes = useCallback(() => {
    fetch('/api/admin/notifications', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: ShellNote[] }) => setNotes(j.items ?? []))
      .catch(() => setNotes([]));
  }, []);
  // Once per shell (later pages reuse the count; opening the panel reads again); never on the sign-in page.
  useEffect(() => {
    if (!window.location.pathname.startsWith(ADMIN_LOGIN)) loadNotes();
  }, [loadNotes]);

  const openPal = useCallback(() => {
    remember();
    setPop(null);
    setNtf(false);
    setPal(true);
  }, []);
  const openTodoNow = useCallback(() => {
    remember();
    setPop(null);
    setNtf(false);
    const now = Date.now();
    setLater(readLater(now));
    setTodoAt(now);
  }, []);

  // Ctrl/⌘ K anywhere, "/" when not typing, T opens "To do", Esc closes menus and the fly-out; pages ask through events.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      const typing = typingIn(el);
      const overlay = !!document.querySelector('.a2-ov, .a2-drw, .lm-notif');
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

  const closeNtf = useCallback(() => {
    setNtf(false);
    restore();
  }, []);

  if (pathname === ADMIN_LOGIN || pathname.startsWith(`${ADMIN_LOGIN}/`)) return <>{children}</>;

  const here = locate(pathname);
  const active = here?.section.id ?? null;
  const aiShown = model.aiShown === true;
  const groups = lumenNav(viewer, { aiShown });
  const all = groups.flatMap((g) => g.sections);
  const label = (s: ShellSection) => tt(`sec.${s.id}`);
  const tabsOf = (s: ShellSection) => visibleTabs(s, viewer).map((tb) => ({ id: tb.id, href: visiblePages(tb, viewer)[0]!.href, label: tt(`tab.${s.id}.${tb.id}`) }));
  const badge = (s: ShellSection) => model.badges?.[s.id] ?? 0;
  const unread = (notes ?? []).filter((n) => noteUnread(n, seen)).length;
  const openHere = () => {
    remember();
    setPop(null);
    setGuide({ path: pathname, section: here ? label(here.section) : '' });
  };

  // The fly-out sits beside its icon (icons-only sidebar), placed when the pointer or focus arrives.
  const iconsOnly = () => col || window.matchMedia('(max-width: 899px)').matches;
  const showFly = (id: string, el: HTMLElement) => {
    if (!iconsOnly()) return;
    const r = el.getBoundingClientRect();
    setFly({ id, style: { top: Math.max(8, Math.min(r.top, window.innerHeight - 260)), left: r.right + 8 } });
  };

  const item = (s: ShellSection) => {
    const on = active === s.id;
    const tabs = tabsOf(s);
    const name = label(s);
    const n = badge(s);
    const subOpen = tabs.length > 1 && (openSec === null ? on : openSec === s.id);
    return (
      <div
        key={s.id}
        className={`lm-nw${on ? ' on' : ''}`}
        onPointerEnter={(ev) => ev.pointerType === 'mouse' && showFly(s.id, ev.currentTarget)}
        onPointerLeave={(ev) => ev.pointerType === 'mouse' && setFly((f) => (f?.id === s.id ? null : f))}
        onFocus={(ev) => showFly(s.id, ev.currentTarget)}
        onBlur={(ev) => !ev.currentTarget.contains(ev.relatedTarget as Node | null) && setFly((f) => (f?.id === s.id ? null : f))}
      >
        <div className="lm-itw">
          <Link className={`lm-it${on ? ' on' : ''}`} href={sectionHome(s, viewer)} aria-current={on ? 'page' : undefined} aria-label={n ? tt('nav.waitingIn', { section: name, n }) : name} onClick={() => setFly(null)} data-testid={`a3-nav-${s.id}`}>
            <ShellIcon name={s.icon} size={19} />
            <span className="lm-nl">{name}</span>
            {n ? (
              <i className="lm-bd" aria-hidden="true">
                {n > 99 ? '99+' : n}
              </i>
            ) : null}
          </Link>
          {tabs.length > 1 ? (
            <button type="button" className={`lm-chv${subOpen ? ' o' : ''}`} aria-expanded={subOpen} aria-label={tt('nav.pagesOf', { section: name })} onClick={() => setOpenSec(subOpen ? '' : s.id)}>
              <ShellIcon name="cr" size={14} />
            </button>
          ) : null}
        </div>
        {fly?.id === s.id ? (
          <div className="lm-fly" style={fly.style}>
            <Link className="lm-flyh" href={sectionHome(s, viewer)} onClick={() => setFly(null)} tabIndex={-1}>
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
        {subOpen ? (
          <div className="lm-subs">
            {tabs.map((tb) => {
              const ton = on && here?.tab?.id === tb.id;
              return (
                <Link key={tb.id} href={tb.href} className={`lm-si${ton ? ' on' : ''}`} aria-current={ton ? 'page' : undefined}>
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
    cookie(ADMIN_LANG_COOKIE, v);
    start(() => router.refresh());
  };

  const toggleCol = () => {
    const next = !col;
    setCol(next);
    setFly(null);
    cookie(RAIL_COOKIE, next ? '0' : '1');
  };

  const toggleMode = () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    void saveMine({ theme: { mode: next } });
  };

  const markAll = () => {
    const newest = (notes ?? []).reduce((m, n) => (n.at && n.at > m ? n.at : m), new Date().toISOString());
    setSeen(newest);
    void saveMine({ seen: newest });
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
    <div className="a2-menu lm-menu" role="menu" aria-label={tt('me.menu')}>
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

  // EN | বাং: in the top bar; on a phone inside the account menu (the top bar keeps its 44 px buttons).
  const langGroup = (
    <div className="lm-lang" role="group" aria-label={model.langLabels.group}>
                  <button type="button" className={model.lang === 'en' ? 'on' : ''} aria-pressed={model.lang === 'en'} lang="en" onClick={() => lang('en')}>
                    {model.langLabels.enShort}
                    <span className="a2-sr"> · {model.langLabels.en}</span>
                  </button>
                  <button type="button" className={model.lang === 'bn' ? 'on' : ''} aria-pressed={model.lang === 'bn'} lang="bn" onClick={() => lang('bn')}>
                    {model.langLabels.bnShort}
                    <span className="a2-sr"> · {model.langLabels.bn}</span>
                  </button>
                </div>
  );

  const brand = model.storeName ?? tt('admin');
  const bnScript = /[ঀ-৿]/.test(brand) ? 'bn' : undefined;
  // Home is the Dashboard for whoever may open it; anyone else goes to /admin, which sends them to their start page.
  const dashboard = SHELL_SECTIONS[0]!;
  const homeHref = sectionVisible(dashboard, viewer) ? sectionHome(dashboard, viewer) : '/admin';
  const waiting = todo.length;
  const dark = mode === 'dark';

  return (
    <LumenProvider value={lumen}>
    <div className={`adm2 a3s lm-shell${col ? ' lm-col' : ''}${guide && guideAs === 'side' ? ' a2-gopen' : ''}`} translate="no" lang={model.lang} data-testid="a2-shell" {...themeAttrs(theme)} style={themeStyle(theme) as CSSProperties}>
      <a className="a2-skip" href="#main">
        {tt('nav.skip')}
      </a>
      <div className="lm-wrap">
        <aside className="lm-side a2-z" aria-label={tt('nav.aria')} data-testid="a2-sidebar">
          <div className="lm-brand">
            <Link className="lm-brl" href={homeHref} aria-label={tt('top.home')}>
              <span className="lm-logo" aria-hidden="true">
                {[...brand][0]}
              </span>
              <span className="lm-bt" data-script={bnScript}>
                {brand}
              </span>
            </Link>
            <button type="button" className="lm-iconb lm-colb" aria-pressed={col} aria-label={col ? tt('nav.expand') : tt('nav.collapse')} title={col ? tt('nav.expand') : tt('nav.collapse')} onClick={toggleCol} data-testid="a3-rail-toggle">
              <ShellIcon name="rail" size={18} />
            </button>
          </div>
          <button type="button" className="lm-search" aria-label={tt('top.searchAria')} onClick={openPal} data-testid="a2-search">
            <ShellIcon name="search" size={17} />
            <span>{tt('top.searchShort')}</span>
            <kbd>{tt('top.kbd')}</kbd>
          </button>
          <nav className="lm-nav">
            {groups.map((g) => (
              <div key={g.group} role="group" aria-label={tt(`groups.${g.group}`)} className="lm-gw">
                <div className="lm-gl" aria-hidden="true">
                  {tt(`groups.${g.group}`)}
                </div>
                {g.sections.map(item)}
              </div>
            ))}
          </nav>
          <div className="lm-foot">
            <button type="button" className="lm-me" data-a2pop-btn aria-haspopup="menu" aria-expanded={pop === 'me'} onClick={() => setPop(pop === 'me' ? null : 'me')} data-testid="a2-me">
              <span className="lm-av">{model.me.initials}</span>
              <span className="lm-mt">
                <b>{model.me.name}</b>
                <small>{model.storeName ? `${model.me.role} · ${model.storeName}` : model.me.role}</small>
              </span>
            </button>
            {pop === 'me' ? (
              <div className="lm-mepop" data-a2pop>
                {menu}
              </div>
            ) : null}
          </div>
        </aside>
        <div className="lm-main">
          <header className="lm-top a2-z">
            <button type="button" className="lm-tb lm-tsearch" aria-label={tt('top.searchAria')} onClick={openPal}>
              <ShellIcon name="search" size={19} />
            </button>
            <div className="lm-tbr">
              <a className="lm-shop" href="/" target="_blank" rel="noopener" title={tt('top.shopTitle')}>
                <ShellIcon name="ext" size={15} />
                <span>{tt('top.shop')}</span>
              </a>
              <button type="button" className={`lm-tb${todoAt !== null ? ' on' : ''}`} aria-label={waiting ? tt('top.todoWaiting', { n: waiting }) : tt('top.todo')} title={tt('top.todoTitle')} onClick={openTodoNow} data-testid="a3-todo">
                <ShellIcon name="inbox" size={19} />
                {waiting ? <i className="lm-dot" aria-hidden="true" /> : null}
              </button>
              <button type="button" className={`lm-tb${guide ? ' on' : ''}`} aria-label={tt('top.guide')} title={tt('top.guide')} aria-expanded={!!guide} onClick={() => (guide ? setGuide(null) : openHere())} data-testid="a2-help">
                <ShellIcon name="help" size={19} />
              </button>
              {langGroup}
              <button type="button" className="lm-tb" aria-pressed={dark} aria-label={dark ? tt('top.light') : tt('top.dark')} title={dark ? tt('top.light') : tt('top.dark')} onClick={toggleMode} data-testid="lm-moon">
                <ShellIcon name={dark ? 'sun' : 'moon'} size={19} />
              </button>
              <button
                type="button"
                className={`lm-tb${ntf ? ' on' : ''}`}
                data-lm-bell
                aria-label={unread ? tt('top.bellUnread', { n: unread }) : tt('top.bell')}
                aria-expanded={ntf}
                onClick={() => {
                  if (ntf) return closeNtf();
                  remember();
                  setPop(null);
                  loadNotes();
                  setNtf(true);
                }}
                data-testid="a2-bell"
              >
                <ShellIcon name="bell" size={19} />
                {unread ? (
                  <i className="lm-bdot" aria-hidden="true">
                    {unread > 9 ? '9+' : unread}
                  </i>
                ) : null}
              </button>
              <button type="button" className="lm-tb lm-av lm-phav" data-a2pop-btn aria-label={`${tt('top.account')} · ${model.me.name}`} aria-haspopup="menu" aria-expanded={pop === 'me2'} onClick={() => setPop(pop === 'me2' ? null : 'me2')} data-testid="a2-avatar">
                {model.me.initials}
              </button>
            </div>
            {pop === 'me2' ? (
              <div className="lm-toppop" data-a2pop>
                {menu}
                <div className="lm-menu-lang">{langGroup}</div>
              </div>
            ) : null}
            {ntf ? <NotificationsPanel dict={d} items={notes} seen={seen} onMarkAll={markAll} onClose={closeNtf} /> : null}
          </header>
          <main className="a2-ct a3-ct lm-ct" id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <nav className="lm-bar a2-z" aria-label={tt('nav.quick')} data-testid="lm-bar">
        {all.map((s) => {
          const on = active === s.id;
          const n = badge(s);
          return (
            <Link key={s.id} href={sectionHome(s, viewer)} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} aria-label={n ? tt('nav.waitingIn', { section: label(s), n }) : undefined}>
              <ShellIcon name={s.icon} size={20} />
              <span>{label(s)}</span>
              {n ? (
                <i className="lm-bd" aria-hidden="true">
                  {n > 99 ? '99+' : n}
                </i>
              ) : null}
            </Link>
          );
        })}
      </nav>
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
          mode={guideAs}
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
      <ToastHost />
    </div>
    </LumenProvider>
  );
}
