'use client';
// PR 40 (desktop, D-001; H4 + H6 of CN-008) — the desktop nav row and its menus (demo 03-layout.js deskNavHTML,
// 97-desk-a.js). The row is New in · the live categories in the catalogue's order · More · Combos · Sets, arranged
// the way the owner picked (`shell.desktopNav.layout`; shell-model arrangeDeskNav). When it does not fit, the last
// categories fold into More (measured, never guessed); in 'catsMore' the ones after `mainCount` live there anyway.
//
// A category with sub-categories, More and the one "Shop" item open a menu, in the owner's style
// (`shell.desktopNav.megaStyle`): 'drop' (default) — a compact list right under the item, where a category with its
// own sub-categories opens a flyout to the side ("menu aim": the pointer may cross other rows on its way into an open
// flyout without switching it) — or 'panel', the earlier full-width panel, kept as an option.
// Timing: open `megaEnterMs` after the mouse settles, close `megaLeaveMs` after it leaves item and menu, switch at
// once between items. Keyboard: Space or ↓ open from the item, ← → move along the row, ↑ ↓ inside a list, → into a
// flyout and ← back out, Esc closes and gives focus back; a click or Enter follows the link. A touch tap on a tablet
// opens the menu first. The phone never shows this row (CSS).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DesktopNav } from '@extas/settings';
import type { DeskNavItem } from '@/lib/shop/shell-model';

export interface MegaData {
  title: string;
  /** The category's own name and its count of styles ("12 styles"), for the More and Shop lists. */
  name: string;
  styles: string;
  all: { href: string; label: string; n: string };
  links: Array<{ href: string; label: string; n: string }>;
}

interface Row {
  href: string;
  label: string;
  n?: string;
  all?: boolean;
  /** The rows of this row's flyout. */
  fly?: Row[];
}
type Entry = Row | 'sep';
type Kind = 'cat' | 'more' | 'shop';

const Chev = () => (
  <svg className="nav-chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const MdChev = () => (
  <svg className="md-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

const DESK = '(min-width:1024px)';
const FLY_INTENT_MS = 90;
const AIM_RECHECK_MS = 220;

/** One category as a list: All · its sub-categories (demo mdCatList). */
function catRows(m: MegaData): Row[] {
  return [{ href: m.all.href, label: m.all.label, n: m.all.n, all: true }, ...m.links.map((l) => ({ href: l.href, label: l.label, n: l.n }))];
}

export function DeskNav({
  label,
  items,
  layout,
  megaStyle,
  allStyles,
  mega,
  enterMs,
  leaveMs,
}: {
  label: string;
  items: DeskNavItem[];
  layout: DesktopNav['layout'];
  megaStyle: DesktopNav['megaStyle'];
  /** "All styles", the last row of the Shop list. */
  allStyles: string;
  mega: Record<string, MegaData>;
  enterMs: number;
  leaveMs: number;
}) {
  const nav = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ id: string; by: 'hover' | 'key' | 'tap' } | null>(null);
  const [fly, setFly] = useState<number | null>(null);
  const [flyPos, setFlyPos] = useState<{ top: number; left: boolean }>({ top: 0, left: false });
  const [hdr, setHdr] = useState<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aim = useRef({ x: 0, y: 0, px: 0, py: 0 });
  /** The open flyout, for the handlers that run between renders (menu aim, keys). */
  const flyRef2 = useRef<number | null>(null);
  useLayoutEffect(() => {
    flyRef2.current = fly;
  }, [fly]);

  // V12.2 (Note 54 #16, round 2): in 'catsMore' the first `mainCount` categories always stay; the ones after them start
  // under More (so the first paint matches) and come back into the row while there is real room. ~~fixFold always folded~~
  const [measured, setMeasured] = useState(false);
  const isFolded = (x: DeskNavItem) => (x.fixFold ? !(layout === 'catsMore' && measured) || folded.has(x.id) : folded.has(x.id));
  const underMore = items.filter((x) => (x.fold || x.fixFold) && isFolded(x));
  const kindOf = (x: DeskNavItem): Kind | null => {
    if (x.more) return x.mega && underMore.length ? 'more' : null;
    if (x.kind === 'shop') return x.mega && (x.shopCats ?? []).some((s) => mega[s]) ? 'shop' : null;
    if (x.catSlug && x.mega && mega[x.catSlug]?.links.length) return 'cat';
    return null;
  };

  // ---- fold the last categories into More until the row fits (the owner's fixed ones stay folded) ----
  const fit = useCallback(() => {
    const el = nav.current;
    if (!el || !window.matchMedia(DESK).matches) return;
    const inn = el.parentElement;
    const logo = inn?.querySelector('.logo.hide-m');
    const right = inn?.querySelector('.hdr-r');
    // catsMore (V12.2): the categories after `mainCount` are the ones that come and go; the main ones never fold
    const cm = el.dataset.layout === 'catsMore';
    const all = Array.from(el.querySelectorAll<HTMLElement>(cm ? '.nav-i[data-fixfold]' : '.nav-i[data-fold]:not([data-fixfold])'));
    const moreEl = el.querySelector<HTMLElement>('.nav-more');
    const fixed = cm ? 0 : el.querySelectorAll('.nav-i[data-fixfold]').length;
    all.forEach((a) => a.classList.remove('nav-folded'));
    if (moreEl) moreEl.hidden = fixed === 0;
    // H4 'priority' (priority-plus): the row keeps clear air beside the logo and the icons; catsMore keeps 28 px.
    const air = el.dataset.layout === 'priority' ? 44 : cm ? 28 : 14;
    const over = () => {
      const n = el.getBoundingClientRect();
      const r = right?.getBoundingClientRect();
      const l = logo?.getBoundingClientRect();
      const ib = inn!.getBoundingClientRect();
      const pr = Number.parseFloat(getComputedStyle(inn!).paddingRight) || 0;
      // The demo's tests (hdrFit): the menu runs into the icons, into the logo, pushes the icons out, or overflows.
      const intoIcons = r ? n.right - (r.left - air) : -1;
      const intoLogo = l ? l.right + air - n.left : -1;
      const iconsOut = r ? r.right - (ib.right - pr + 1) : -1;
      // ~~el.scrollWidth - (el.clientWidth + 1)~~ — the scroll width also counts the invisible 44 px tap layers of
      // PR 85 (a short last word like "Sets" reaches 6 px past the row), which folded every category away. The items'
      // own boxes are what the shopper sees.
      const lastRight = Math.max(n.left, ...Array.from(el.querySelectorAll<HTMLElement>('.nav-i')).filter((a) => a.offsetParent && !a.hidden).map((a) => a.getBoundingClientRect().right));
      const overflow = lastRight - (n.right + 1);
      return Math.max(intoIcons, intoLogo, iconsOut, overflow) > 0;
    };
    const out = new Set<string>();
    for (let k = all.length - 1; k >= 0 && over(); k--) {
      all[k]!.classList.add('nav-folded');
      out.add(all[k]!.dataset.nav!);
      if (moreEl) moreEl.hidden = false;
    }
    setFolded((prev) => (prev.size === out.size && [...out].every((x) => prev.has(x)) ? prev : out));
    setMeasured(true);
  }, []);

  useLayoutEffect(() => {
    setHdr(nav.current?.closest<HTMLElement>('.hdr') ?? null);
    fit();
    const on = () => requestAnimationFrame(fit);
    window.addEventListener('resize', on);
    document.fonts?.ready.then(on).catch(() => undefined);
    return () => window.removeEventListener('resize', on);
  }, [fit]);

  const itemEl = (id: string) => nav.current?.querySelector(`[data-nav="${CSS.escape(id)}"]`) as HTMLElement | null;

  const close = useCallback((focusBack = false) => {
    clearTimeout(timer.current);
    clearTimeout(flyTimer.current);
    setFly(null);
    setOpen((o) => {
      if (o && focusBack) requestAnimationFrame(() => (nav.current?.querySelector(`[data-nav="${CSS.escape(o.id)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }));
      return null;
    });
  }, []);

  const openItem = (id: string, by: 'hover' | 'key' | 'tap') => {
    clearTimeout(timer.current);
    if (open?.id !== id) setFly(null);
    setOpen({ id, by });
  };

  // ---- what the open item's menu holds ----
  const current = open ? items.find((x) => x.id === open.id) : undefined;
  const kind = current ? kindOf(current) : null;
  const rowsFor = (x: DeskNavItem, k: Kind): Entry[] => {
    if (k === 'cat') return catRows(mega[x.catSlug!]!);
    const cats = k === 'shop' ? (x.shopCats ?? []).map((s) => ({ slug: s, item: undefined as DeskNavItem | undefined })) : underMore.map((y) => ({ slug: y.catSlug, item: y }));
    const rows: Entry[] = cats.flatMap(({ slug, item }): Row[] => {
      const m = slug ? mega[slug] : undefined;
      if (!m) return item ? [{ href: item.href, label: item.label }] : [];
      return [{ href: m.all.href, label: item?.label ?? m.name, n: m.styles, ...(m.links.length ? { fly: catRows(m) } : {}) }];
    });
    return k === 'shop' ? [...rows, 'sep', { href: x.href, label: allStyles, all: true }] : rows;
  };
  const entries = current && kind ? rowsFor(current, kind) : [];
  const rows = entries.filter((e): e is Row => e !== 'sep');
  const drop = megaStyle === 'drop';

  // ---- the dropdown sits under its item, kept inside the header (demo megaDropOpen) ----
  useLayoutEffect(() => {
    const p = panelRef.current;
    if (!p || !drop || !open || !hdr) return;
    const it = itemEl(open.id);
    if (!it) return;
    const hr = hdr.getBoundingClientRect();
    const ir = it.getBoundingClientRect();
    p.style.left = '0px';
    const w = p.offsetWidth || 260;
    const left = Math.max(12, Math.min(ir.left - hr.left - 14, hr.width - w - 12));
    p.style.left = `${Math.round(left)}px`;
  }, [open, drop, hdr]);

  // ---- the flyout beside its row; on the left when there is no room on the right; on screen vertically ----
  useLayoutEffect(() => {
    const p = panelRef.current;
    const f = flyRef.current;
    if (!p || !f || fly === null) return;
    const row = p.querySelector<HTMLElement>(`.md-list [data-fly="${fly}"]`);
    if (!row) return;
    let top = Math.max(0, row.offsetTop - 8);
    const left = p.getBoundingClientRect().right + f.offsetWidth > window.innerWidth - 8;
    const over = p.getBoundingClientRect().top + top + f.offsetHeight - (window.innerHeight - 8);
    if (over > 0) top = Math.max(0, top - over);
    setFlyPos((o) => (o.top === top && o.left === left ? o : { top, left }));
  }, [fly]);

  // ---- menu aim: is the pointer travelling from where it was toward the open flyout? (demo mdAiming) ----
  const aiming = () => {
    const f = flyRef.current;
    if (!f || flyRef2.current === null) return false;
    const r = f.getBoundingClientRect();
    const left = f.classList.contains('md-left');
    const ex = left ? r.right : r.left;
    const a = { x: aim.current.px, y: aim.current.py };
    const b = { x: aim.current.x, y: aim.current.y };
    if (left ? b.x >= a.x : b.x <= a.x) return false;
    const slope = (p1: { x: number; y: number }, p2: { x: number; y: number }) => (p2.y - p1.y) / (p2.x - p1.x || 0.0001);
    const up = { x: ex, y: r.top - 20 };
    const dn = { x: ex, y: r.bottom + 20 };
    const s1 = slope(b, up);
    const s2 = slope(b, dn);
    const p1 = slope(a, up);
    const p2 = slope(a, dn);
    return left ? s1 > p1 && s2 < p2 : s1 < p1 && s2 > p2;
  };
  const decide = (i: number | null) => {
    clearTimeout(flyTimer.current);
    const want = i !== null && rows[i]?.fly ? i : null;
    if (flyRef2.current !== null && aiming()) {
      flyTimer.current = setTimeout(() => decide(i), AIM_RECHECK_MS); // on the way into the flyout: wait, then look again
      return;
    }
    if (flyRef2.current === null && want !== null) {
      flyTimer.current = setTimeout(() => setFly(want), FLY_INTENT_MS); // a little intent before the first flyout
      return;
    }
    setFly(want);
  };

  // ---- document-wide: a press outside closes; keyboard focus leaving closes; Esc; ↑ ↓ → ← inside the menu ----
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest?.('.hdr .nav-d') && !t?.closest?.('#mega-panel')) close();
    };
    const out = () =>
      setTimeout(() => {
        const a = document.activeElement;
        if (open.by !== 'hover' && !(a?.closest('.hdr .nav-d') || a?.closest('#mega-panel'))) close();
      }, 0);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      aim.current = { px: aim.current.x, py: aim.current.y, x: e.clientX, y: e.clientY };
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
        return;
      }
      const a = document.activeElement as HTMLElement | null;
      if (!a?.closest('#mega-panel')) return;
      const inFly = a.closest('.md-fly');
      if (e.key === 'ArrowRight' && a.matches('.md-list [data-fly]')) {
        e.preventDefault();
        setFly(Number(a.dataset.fly));
        requestAnimationFrame(() => (flyRef.current?.querySelector('a[href]') as HTMLElement | null)?.focus());
        return;
      }
      if (e.key === 'ArrowLeft' && inFly) {
        e.preventDefault();
        const k = flyRef2.current;
        setFly(null);
        if (k !== null) (panelRef.current?.querySelector(`.md-list [data-fly="${k}"]`) as HTMLElement | null)?.focus();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        // In the dropdown ↑ ↓ stay inside the list the focus is in (the main list or the open flyout).
        const box = inFly ?? panelRef.current?.querySelector('.md-list') ?? panelRef.current;
        const fs = Array.from(box?.querySelectorAll<HTMLElement>('a[href]') ?? []);
        const j = fs.indexOf(a);
        if (e.key === 'ArrowUp' && j <= 0 && !inFly) {
          itemEl(open.id)?.focus();
          return;
        }
        fs[Math.min(fs.length - 1, Math.max(0, j + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('focusout', out);
    document.addEventListener('keydown', key);
    document.addEventListener('pointermove', move, { passive: true });
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('focusout', out);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointermove', move);
    };
  }, [open, close]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(flyTimer.current);
    },
    [],
  );

  const visible = () =>
    (Array.from(nav.current?.querySelectorAll('.nav-i') ?? []) as HTMLElement[]).filter((a) => !a.hidden && !a.classList.contains('nav-folded'));

  const onKey = (x: DeskNavItem) => (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    const has = kindOf(x) !== null;
    if ((e.key === ' ' || e.key === 'Spacebar') && has) {
      e.preventDefault();
      if (open?.id === x.id) close();
      else openItem(x.id, 'key');
      return;
    }
    if (e.key === 'ArrowDown' && has) {
      e.preventDefault();
      openItem(x.id, 'key');
      requestAnimationFrame(() => (document.querySelector('#mega-panel .md-list a[href], #mega-panel a[href]') as HTMLElement | null)?.focus());
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const list = visible();
      const i = list.indexOf(e.currentTarget);
      const nx = list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
      if (!nx) return;
      nx.focus();
      if (open) {
        const it = items.find((k) => k.id === nx.dataset.nav);
        if (it && kindOf(it)) openItem(it.id, 'key');
        else close();
      }
    }
  };

  const enter = (x: DeskNavItem) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !window.matchMedia(DESK).matches) return;
    clearTimeout(timer.current);
    if (!kindOf(x)) {
      if (open) timer.current = setTimeout(() => close(), leaveMs);
      return;
    }
    if (open && open.id !== x.id) {
      openItem(x.id, 'hover'); // already browsing: switch at once
      return;
    }
    timer.current = setTimeout(() => openItem(x.id, 'hover'), enterMs);
  };
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const to = e.relatedTarget as Element | null;
    if (to?.closest?.('.hdr .nav-d .nav-i[data-mega]') || to?.closest?.('#mega-panel')) return;
    clearTimeout(timer.current);
    if (open) timer.current = setTimeout(() => close(), leaveMs);
  };
  const tap = (x: DeskNavItem) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    const pe = e.nativeEvent as PointerEvent;
    if (!kindOf(x) || !window.matchMedia(DESK).matches) return;
    if (pe.pointerType !== 'touch' && pe.pointerType !== 'pen') return;
    if (open?.id === x.id) return;
    e.preventDefault();
    openItem(x.id, 'tap');
  };

  const rowEl = (r: Row, i: number | null, key: string) => (
    <a
      key={key}
      className={`mega-a md-row${r.all ? ' mega-all' : ''}${i !== null && fly === i ? ' md-on' : ''}`}
      href={r.href}
      role="menuitem"
      data-fly={i !== null && r.fly ? i : undefined}
      aria-haspopup={i !== null && r.fly ? 'true' : undefined}
      aria-expanded={i !== null && r.fly ? fly === i : undefined}
      onFocus={i !== null ? () => setFly(r.fly ? i : null) : undefined}
    >
      <span>{r.label}</span>
      {r.n ? <span className="mega-n">{r.n}</span> : null}
      {i !== null && r.fly ? <MdChev /> : null}
    </a>
  );

  let body: React.ReactNode = null;
  if (current && kind && drop) {
    const rowAt = (n: number) => entries.slice(0, n).filter((e) => e !== 'sep').length;
    body = (
      <>
        <div
          className="md-list"
          role="menu"
          aria-label={current.label}
          onPointerOver={(e) => {
            if (e.pointerType !== 'mouse') return;
            const row = (e.target as Element).closest?.('.md-row') as HTMLElement | null;
            if (!row) return;
            const k = row.dataset.fly !== undefined ? Number(row.dataset.fly) : null;
            if (k !== null && k === flyRef2.current) {
              clearTimeout(flyTimer.current);
              return;
            }
            decide(k);
          }}
        >
          {entries.map((e, n) => {
            if (e === 'sep') return <div key={`sep-${n}`} className="md-sep" role="separator" />;
            return rowEl(e, rowAt(n), `${n}-${e.href}`);
          })}
        </div>
        <div
          ref={flyRef}
          className={`md-fly${flyPos.left ? ' md-left' : ''}`}
          hidden={fly === null || !rows[fly]?.fly}
          role={fly !== null ? 'menu' : undefined}
          aria-label={fly !== null ? rows[fly]?.label : undefined}
          style={{ top: flyPos.top }}
          onPointerOver={() => clearTimeout(flyTimer.current)}
        >
          {fly !== null ? rows[fly]?.fly?.map((r, n) => rowEl(r, null, `f-${n}-${r.href}`)) : null}
        </div>
      </>
    );
  } else if (current && kind === 'cat') {
    const panel = mega[current.catSlug!]!;
    body = (
      <div className="container mega-in mega-cat">
        <div className="mega-cols n1">
          <div className="mega-col">
            <div className="mega-h">{panel.title}</div>
            <a className="mega-a mega-all" href={panel.all.href}>
              <span>{panel.all.label}</span>
              <span className="mega-n">{panel.all.n}</span>
            </a>
            {panel.links.map((l) => (
              <a key={l.href} className="mega-a" href={l.href}>
                <span>{l.label}</span>
                <span className="mega-n">{l.n}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  } else if (current && kind) {
    // The earlier panel's More / Shop: one tile per category (the pictures join with the catalogue pages, S03).
    body = (
      <div className="container mega-in mega-more">
        <div className="mega-tiles">
          {rows
            .filter((r) => !r.all)
            .map((r) => (
              <a key={r.href} className="mega-tile" href={r.href}>
                <span className="mega-tile-n">{r.label}</span>
                {r.n ? <span className="mega-n">{r.n}</span> : null}
              </a>
            ))}
        </div>
      </div>
    );
  }

  return (
    <nav ref={nav} className="nav-d" aria-label={label} data-layout={layout}>
      {items.map((x) => {
        const k = kindOf(x);
        const on = open?.id === x.id;
        const here = x.current || (x.more ? underMore.some((y) => y.current) : false);
        return (
          <a
            key={x.id}
            className={`nav-i${here ? ' on' : ''}${x.more ? ' nav-more' : ''}${on ? ' mega-on' : ''}${!x.more && isFolded(x) ? ' nav-folded' : ''}`}
            href={x.href}
            hidden={x.more ? underMore.length === 0 : undefined}
            data-nav={x.id}
            data-fold={x.fold ? '1' : undefined}
            data-fixfold={x.fixFold ? '1' : undefined}
            data-mega={k ?? undefined}
            aria-haspopup={k ? 'true' : undefined}
            aria-expanded={k ? on : undefined}
            aria-controls={k ? 'mega-panel' : undefined}
            aria-current={here ? 'page' : undefined}
            title={x.more && !k ? underMore.map((y) => y.label).join(' · ') || undefined : undefined}
            onPointerEnter={enter(x)}
            onPointerLeave={leave}
            onKeyDown={onKey(x)}
            onClick={tap(x)}
          >
            {x.label}
            {k ? <Chev /> : null}
          </a>
        );
      })}
      {hdr && body
        ? createPortal(
            <div
              ref={panelRef}
              id="mega-panel"
              className={`mega${drop ? ' mega-drop' : ''} on`}
              role="region"
              aria-label={current!.label}
              onPointerEnter={() => clearTimeout(timer.current)}
              onPointerLeave={(e) => {
                if (e.pointerType !== 'mouse') return;
                const to = e.relatedTarget as Element | null;
                if (to?.closest?.('.hdr .nav-d .nav-i[data-mega]')) return;
                timer.current = setTimeout(() => close(), leaveMs);
              }}
            >
              {body}
            </div>,
            hdr,
          )
        : null}
    </nav>
  );
}
