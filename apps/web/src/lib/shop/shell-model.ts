// PR 40 / 501 — the shell as data, ready to draw: which items the desktop row, the phone menu, the bottom bar and the
// footer show, in what order, with what words and addresses. Plain functions over the settings (`shell.*`) and the
// catalogue's categories, so the rules are unit-tested and the components only draw. The order and the rules are the
// approved demo's (docs/demo/src/03-layout.js deskNavItems, phoneMenuHTML, storeFooter, bottomNav).
import type { DesktopNav, ShellAnnounce, ShellFooter, ShellMenu, ShopIcon, ShopLabel } from '@extas/settings';
import type { ShopT, Vars } from './dict';
import { hrefIn, type ShopLang } from './lang';

export type Requirement = 'cod' | 'freeDelivery' | 'exchange' | 'whatsapp' | 'hotline' | 'signupList';
export type Flags = Record<Requirement, boolean>;

/** The marketing sign-up list (PR 123 / 298, S14) does not exist yet: the footer's Join form keeps nothing, so it is
 *  not shown (CN-017: every promise in customer copy is tested end to end, or the copy goes). PR 123 replaces this
 *  with the live check that the list keeps the number and its consent. */
export const SIGNUP_LIST_LIVE = false;

/** A category as the shell needs it (top level, with its children for the desktop panel). */
export interface ShopCategory {
  slug: string;
  nameEn: string;
  nameBn: string | null;
  garment: string | null;
  /** Published products in it and in its sub-categories. */
  count: number;
  children: Array<{ slug: string; nameEn: string; nameBn: string | null; count: number }>;
}

export const categoryHref = (slug: string) => `/collections/${slug}`;
export const categoryName = (c: { nameEn: string; nameBn: string | null }, lang: ShopLang) => (lang === 'bn' && c.nameBn ? c.nameBn : c.nameEn);

/** Honesty: a line that promises COD, free delivery or an exchange shows only once the owner has switched it on. */
export function requirementsMet(requires: readonly Requirement[] | undefined, flags: Flags): boolean {
  return (requires ?? []).every((r) => flags[r]);
}

/** The path a link points to, without query or hash (for "you are here"). */
const pathOf = (href: string) => href.split(/[?#]/)[0] || '/';
export function isCurrent(current: string, href: string): boolean {
  const p = pathOf(href);
  if (p === '/') return current === '/';
  return current === p || current.startsWith(`${p}/`);
}

// ---- the announcement bar ----

export interface Announcement {
  id: string;
  text: string;
  href: string | null;
}

export function liveAnnouncements(a: ShellAnnounce, today: string, flags: Flags, t: ShopT, vars: Vars): Announcement[] {
  if (!a.on) return [];
  return a.messages
    .filter((m) => m.on && (!m.start || today >= m.start) && (!m.end || today <= m.end) && requirementsMet(m.requires, flags))
    .map((m) => ({ id: m.id, text: t.label(m.text, vars), href: m.href ? hrefIn(t.lang, m.href) : null }))
    .filter((m) => m.text.trim().length > 0);
}

// ---- the desktop nav row ----

export type DeskNavKind = 'new' | 'cat' | 'more' | 'combos' | 'sets' | 'journal' | 'link' | 'shop';

export interface DeskNavItem {
  id: string;
  kind: DeskNavKind;
  label: string;
  href: string;
  current: boolean;
  /** Opens a list or panel: a category with sub-categories, More, or the one "Shop" item. */
  mega: boolean;
  /** Folds into "More" when the row is too narrow (categories and the owner's links). */
  fold: boolean;
  /** H4 'catsMore': kept under More by the owner's arrangement, whatever the width. */
  fixFold?: boolean;
  more?: boolean;
  catSlug?: string;
  /** H4 'shop': the categories behind the one "Shop" item, in menu order. */
  shopCats?: string[];
}

const own = (t: ShopT, l: ShopLabel | undefined, fallbackKey: string) => t.label(l, {}, fallbackKey);

/**
 * The desktop row in menu order (demo deskNavItems), then placed the way the owner picked (deskNavArrange, H4):
 * 'all' as it was · 'catsMore' the categories after the first `mainCount` stay under More · 'shop' one "Shop" item
 * with every category, then New in (no list of its own) and the rest · 'priority' as 'all' (the row keeps roomier
 * gaps when it folds, DeskNav). ~~The demo's "Sale" item in the 'shop' arrangement~~ waits for prices on sale (S03).
 */
export function deskNavItems(menu: ShellMenu, nav: DesktopNav, cats: readonly ShopCategory[], t: ShopT, current: string): DeskNavItem[] {
  const vis = (x: { on: boolean; desk: boolean }) => x.on && x.desk;
  const H = (p: string) => hrefIn(t.lang, p);
  const out: DeskNavItem[] = [];
  const live = cats.filter((c) => c.count > 0);
  const catItem = (id: string, c: ShopCategory, label?: ShopLabel): DeskNavItem => {
    const href = categoryHref(c.slug);
    return {
      id,
      kind: 'cat',
      label: label ? t.label(label) : categoryName(c, t.lang),
      href: H(href),
      current: isCurrent(current, href),
      mega: nav.mega && c.children.some((s) => s.count > 0),
      fold: true,
      catSlug: c.slug,
    };
  };
  const plain = (id: string, kind: DeskNavKind, label: string, href: string, fold = false): DeskNavItem => ({
    id,
    kind,
    label,
    href: H(href),
    current: isCurrent(current, href),
    mega: false,
    fold,
  });
  for (const x of withCategories(menu.items)) {
    if (x.kind === 'new' && nav.newIn && vis(x)) out.push(plain(x.id, 'new', own(t, x.label, 'nav.newIn'), x.href ?? '/collections/new-in'));
    else if (x.kind === 'cat') {
      const c = live.find((k) => k.slug === x.cat);
      if (c && vis(x)) out.push(catItem(x.id, c, x.label));
    } else if (x.kind === 'cats') {
      for (const c of unnamedCategories(menu.items, live)) out.push(catItem(`cat-${c.slug}`, c));
    } else if (x.kind === 'more' && vis(x)) {
      out.push({ id: x.id, kind: 'more', label: own(t, x.label, 'nav.more'), href: H('/collections/new-in?all=1'), current: false, mega: nav.mega, fold: false, more: true });
    } else if (x.kind === 'combos' && nav.combos && vis(x)) out.push(plain(x.id, 'combos', own(t, x.label, 'nav.combos'), x.href ?? '/combos'));
    else if (x.kind === 'sets' && nav.sets && vis(x)) out.push(plain(x.id, 'sets', own(t, x.label, 'nav.sets'), x.href ?? '/combos/build-your-own'));
    else if (x.kind === 'journal' && nav.journal && vis(x)) out.push(plain(x.id, 'journal', own(t, x.label, 'nav.journal'), x.href ?? '/journal'));
    else if (x.kind === 'link' && vis(x) && x.href) out.push(plain(x.id, 'link', t.label(x.label), x.href, true));
  }
  return arrangeDeskNav(out, nav, t);
}

export function arrangeDeskNav(items: DeskNavItem[], nav: DesktopNav, t: ShopT): DeskNavItem[] {
  if (nav.layout === 'catsMore') {
    let k = 0;
    const out = items.map((x) => (x.catSlug && ++k > nav.mainCount ? { ...x, fixFold: true } : x));
    const anyFixed = out.some((x) => x.fixFold);
    return out.map((x) => (x.more && anyFixed ? { ...x, current: out.some((y) => y.fixFold && y.current) } : x));
  }
  if (nav.layout === 'shop') {
    const cats = items.filter((x) => x.catSlug);
    const rest = items.filter((x) => !x.catSlug && !x.more);
    const shop: DeskNavItem = {
      id: 'shop',
      kind: 'shop',
      label: t.label(nav.shopLabel, {}, 'nav.shop'),
      href: hrefIn(t.lang, '/collections/new-in?all=1'),
      current: cats.some((x) => x.current),
      mega: nav.mega && cats.length > 0,
      fold: false,
      shopCats: cats.map((x) => x.catSlug!),
    };
    const newIn = rest.find((x) => x.kind === 'new');
    return [shop, ...(newIn ? [{ ...newIn, mega: false }] : []), ...rest.filter((x) => x !== newIn)];
  }
  return items;
}

type MenuItem = ShellMenu['items'][number];
type Expanded = MenuItem | { id: string; kind: 'cats'; on: true; desk: true; phone: true };

/**
 * The menu tree with every category in it: categories the list names stay where they are; the rest join after the
 * last category item, or right after "New in" when the list names none (demo menuItems()) — so a new category shows
 * up in every menu with no edit.
 */
export function withCategories(items: ShellMenu['items']): Expanded[] {
  const out: Expanded[] = [...items];
  let at = -1;
  out.forEach((x, i) => {
    if (x.kind === 'cat') at = i;
  });
  if (at < 0) at = out.findIndex((x) => x.kind === 'new');
  out.splice(at + 1, 0, { id: 'cats', kind: 'cats', on: true, desk: true, phone: true });
  return out;
}

/** Categories not named by a `cat` item (the ones the `cats` slot stands for). */
export function unnamedCategories(items: ShellMenu['items'], cats: readonly ShopCategory[]): ShopCategory[] {
  const named = new Set(items.filter((x) => x.kind === 'cat').map((x) => x.cat));
  return cats.filter((c) => !named.has(c.slug));
}

// ---- the phone menu ----

export interface MenuRow {
  id: string;
  href: string;
  label: string;
  icon?: ShopIcon;
  /** The demo draws an icon box with no drawing in it for "New in" (its `sparkle` icon does not exist). */
  emptyIcon?: boolean;
  testid?: string;
}

export function phoneMenuRows(menu: ShellMenu, cats: readonly ShopCategory[], t: ShopT): MenuRow[] {
  const H = (p: string) => hrefIn(t.lang, p);
  const rows: MenuRow[] = [];
  const rest = unnamedCategories(menu.items, cats);
  for (const x of withCategories(menu.items)) {
    if (!x.on || !x.phone) continue;
    if (x.kind === 'new') rows.push({ id: x.id, href: H(x.href ?? '/collections/new-in'), label: own(t, x.label, 'nav.newIn'), emptyIcon: true });
    else if (x.kind === 'cats') {
      for (const c of rest) rows.push({ id: `cat-${c.slug}`, href: H(categoryHref(c.slug)), label: categoryName(c, t.lang) });
    } else if (x.kind === 'cat') {
      const c = cats.find((k) => k.slug === x.cat);
      if (c) rows.push({ id: x.id, href: H(categoryHref(c.slug)), label: x.label ? t.label(x.label) : categoryName(c, t.lang) });
    } else if (x.kind === 'sets') rows.push({ id: x.id, href: H(x.href ?? '/combos/build-your-own'), label: t.label(x.phoneLabel ?? x.label, {}, 'nav.buildYourOwnSet') });
    else if (x.kind === 'setsPhone') rows.push({ id: x.id, href: H(x.href ?? '/combos'), label: own(t, x.label, 'nav.setsAndCombos') });
    else if (x.kind === 'journal') rows.push({ id: x.id, href: H(x.href ?? '/journal'), label: own(t, x.label, 'nav.journal'), icon: x.icon ?? 'doc', testid: 'mn-journal' });
    else if (x.kind === 'combos') rows.push({ id: x.id, href: H(x.href ?? '/combos'), label: own(t, x.label, 'nav.combos'), ...(x.icon ? { icon: x.icon } : {}) });
    else if (x.kind === 'more') rows.push({ id: x.id, href: H('/collections/new-in?all=1'), label: own(t, x.label, 'nav.more'), ...(x.icon ? { icon: x.icon } : {}) });
    else if (x.kind === 'link' && x.href) rows.push({ id: x.id, href: H(x.href), label: t.label(x.label), ...(x.icon ? { icon: x.icon } : {}) });
  }
  return rows;
}

export function helpRows(menu: ShellMenu, t: ShopT): MenuRow[] {
  return menu.help.filter((x) => x.on).map((x) => ({ id: x.id, href: hrefIn(t.lang, x.href), label: t.label(x.label), ...(x.icon ? { icon: x.icon } : {}) }));
}

// ---- the bottom bar ----

export interface BottomItem {
  id: string;
  href: string;
  label: string;
  icon: ShopIcon;
  kind: 'page' | 'bag' | 'account';
}

export function bottomItems(menu: ShellMenu, t: ShopT): BottomItem[] {
  return menu.bottom.filter((x) => x.on).map((x) => ({ id: x.id, href: hrefIn(t.lang, x.href), label: t.label(x.label), icon: x.icon, kind: x.kind }));
}

// ---- the footer ----

export interface FooterLink {
  id: string;
  href: string;
  label: string;
  icon?: ShopIcon;
  garment?: string | null;
  act?: string;
  /** H13 · highlighted in the reference desktop footer (Journal). */
  hl?: boolean;
}

export interface FooterColumn {
  id: string;
  title: string;
  links: FooterLink[];
}

export function footerColumns(f: ShellFooter, cats: readonly ShopCategory[], t: ShopT, desk: boolean, vars: Vars, opts: { combos: boolean }): FooterColumn[] {
  const H = (p: string) => hrefIn(t.lang, p);
  return f.columns
    .filter((c) => c.on)
    .map((c) => ({
      id: c.id,
      title: t.label(c.title, vars),
      links: c.links.flatMap((l): FooterLink[] => {
        if (!l.on) return [];
        if (l.dev === 'desk' && !desk) return [];
        if (l.dev === 'phone' && desk) return [];
        if (l.id === 'combos' && desk && !opts.combos) return [];
        if (l.cat) {
          const cat = cats.find((k) => k.slug === l.cat);
          if (!cat) return []; // a category that is gone or hidden just drops out
          return [{ id: l.id, href: H(categoryHref(cat.slug)), label: l.label ? t.label(l.label) : categoryName(cat, t.lang), garment: cat.garment }];
        }
        if (!l.href) return [];
        return [{ id: l.id, href: H(l.href), label: t.label(l.label, vars), icon: l.icon ?? 'right', ...(l.act ? { act: l.act } : {}) }];
      }),
    }));
}

/**
 * H13 (CN-008) · the columns of the reference desktop footer (demo ftrDeskLinks): no "phone only" links, the shorter
 * desktop words (`dlabel`) where the owner gave them, each link at its desktop place (`dpos`, else its own place) and
 * the highlight (`hl`). Plain words, no icons.
 */
export function footerDeskColumns(f: ShellFooter, cats: readonly ShopCategory[], t: ShopT, vars: Vars, opts: { combos: boolean }): FooterColumn[] {
  const H = (p: string) => hrefIn(t.lang, p);
  return f.columns
    .filter((c) => c.on)
    .map((c) => ({
      id: c.id,
      title: t.label(c.title, vars),
      links: c.links
        .map((l, i) => ({ l, k: l.dpos ?? i }))
        .sort((a, b) => a.k - b.k)
        .flatMap(({ l }): FooterLink[] => {
          if (!l.on || l.dev === 'phone') return [];
          if (l.id === 'combos' && !opts.combos) return [];
          const words = l.dlabel ?? l.label;
          const hl = l.hl ? { hl: true } : {};
          if (l.cat) {
            const cat = cats.find((k) => k.slug === l.cat);
            if (!cat) return [];
            return [{ id: l.id, href: H(categoryHref(cat.slug)), label: words ? t.label(words, vars) : categoryName(cat, t.lang), garment: cat.garment, ...hl }];
          }
          if (!l.href) return [];
          return [{ id: l.id, href: H(l.href), label: t.label(words, vars), icon: l.icon ?? 'right', ...(l.act ? { act: l.act } : {}), ...hl }];
        }),
    }));
}

export interface Promise_ {
  id: string;
  icon: ShopIcon;
  /** Split at "|": the parts after the first go on a new line on a phone. */
  parts: string[];
}

export function footerPromises(f: ShellFooter, flags: Flags, t: ShopT, vars: Vars): Promise_[] {
  if (!f.promise.on) return [];
  return f.promise.items
    .filter((x) => x.on && requirementsMet(x.requires, flags))
    .map((x) => ({ id: x.id, icon: x.icon, parts: t.label(x.text, vars).split('|') }));
}

export function payMarks(f: ShellFooter, flags: Flags) {
  return f.pay.filter((x) => x.on && requirementsMet(x.requires, flags)).map((x) => x.id);
}

/** "Get new drops first" shows only when it is on and the list behind it keeps the number (CN-017, SIGNUP_LIST_LIVE). */
export function joinShown(f: ShellFooter, flags: Flags): boolean {
  return f.join.on && requirementsMet(f.join.requires, flags);
}
