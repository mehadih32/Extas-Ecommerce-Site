// PR 726 — Website › Brand & menus: the plain shapes the page and its API share. The shop keeps its header, menu and
// footer as settings (`shell.announce`, `shell.header`, `shell.menu`, `shell.footer`) whose words are either a key of
// the shop dictionary or the owner's own text in both languages. The editor works on one flat "card" per area, with
// every word shown as an English + Bengali pair, and the server folds an edited card back onto the stored setting,
// so nothing the editor does not show (a link's icon, the desktop's shorter words …) is ever lost. No React, no
// database, and only type imports from @extas/settings, so the browser bundle stays small.
import type { ShellAnnounce, ShellFooter, ShellHeader, ShellMenu, ShopLabel } from '@extas/settings';

export interface Pair {
  en: string;
  bn: string;
}

/** The shop's words at a dictionary key (the owner's own change of it wins), in both languages. */
export type Words = (key: string) => Pair;

export const CARD_KEYS = ['brand', 'menu', 'footer'] as const;
export type CardKey = (typeof CARD_KEYS)[number];

// ---- the cards ----

export interface BrandCardValue {
  name: string;
  slogan: Pair | null;
  sloganShort: Pair | null;
  /** The home page's search / browser-tab title (`seo.titles.home.title`). */
  tabTitle: Pair;
  logo: string | null;
  logoPhone: string | null;
  favicon: string | null;
  logoSize: { desk: number; phone: number; footer: number };
  logoStyle: number;
}

export interface AnnounceRow {
  id: string;
  text: Pair;
  href: string;
  on: boolean;
  builtIn: boolean;
}
export interface IconRow {
  id: string;
  on: boolean;
}
export interface MenuRow {
  id: string;
  kind: string;
  /** null: the words come from somewhere else (a category's own name). */
  label: Pair | null;
  /** The category's link name, for a category row. */
  cat: string;
  href: string;
  /** Only the owner's own links have an address to edit. */
  editHref: boolean;
  on: boolean;
  desk: boolean;
  phone: boolean;
  builtIn: boolean;
}
export interface MenuCardValue {
  announceOn: boolean;
  announce: AnnounceRow[];
  icons: IconRow[];
  items: MenuRow[];
}

export interface PromiseRow {
  id: string;
  text: Pair;
  on: boolean;
  builtIn: boolean;
}
export interface FooterLinkRow {
  id: string;
  label: Pair | null;
  cat: string;
  href: string;
  editHref: boolean;
  on: boolean;
  builtIn: boolean;
}
export interface FooterColumnRow {
  id: string;
  title: Pair;
  on: boolean;
  builtIn: boolean;
  links: FooterLinkRow[];
}
export interface MarkRow {
  id: string;
  on: boolean;
}
export interface FooterCardValue {
  promiseOn: boolean;
  promise: PromiseRow[];
  joinOn: boolean;
  columns: FooterColumnRow[];
  contact: { whatsapp: boolean; hotline: boolean; hours: boolean };
  social: MarkRow[];
  urls: { facebook: string; instagram: string; youtube: string; tiktok: string };
  pay: MarkRow[];
  copyright: Pair;
}

export type CardValue = { brand: BrandCardValue; menu: MenuCardValue; footer: FooterCardValue };

// ---- words ----

/** A label as an English + Bengali pair (null when the setting has none). */
export function labelPair(label: ShopLabel | undefined, words: Words): Pair | null {
  if (!label) return null;
  if ('key' in label) return words(label.key);
  return { en: label.en, bn: label.bn };
}

/**
 * An edited pair back to a label: the stored label itself when the owner left its words alone (a dictionary key stays a
 * key, so a later change to the dictionary still reaches it), else his own pair.
 */
export function collapseLabel(sent: Pair | null | undefined, original: ShopLabel | undefined, words: Words): ShopLabel | undefined {
  if (!sent) return original;
  const en = sent.en.trim();
  const bn = sent.bn.trim();
  if (original && 'key' in original) {
    const w = words(original.key);
    if (w.en === en && w.bn === bn) return original;
  }
  return { en, bn };
}

// ---- rows from the settings ----

const idsOf = (list: readonly { id: string }[]) => new Set(list.map((x) => x.id));

export function menuCard(
  s: { announce: ShellAnnounce; header: ShellHeader; menu: ShellMenu },
  defaults: { announce: ShellAnnounce; menu: ShellMenu },
  words: Words,
): MenuCardValue {
  const builtMsg = idsOf(defaults.announce.messages);
  const builtItem = idsOf(defaults.menu.items);
  return {
    announceOn: s.announce.on,
    announce: s.announce.messages.map((m) => ({
      id: m.id,
      text: labelPair(m.text, words) ?? { en: '', bn: '' },
      href: m.href ?? '',
      on: m.on,
      builtIn: builtMsg.has(m.id),
    })),
    icons: s.header.icons.map((i) => ({ id: i.id, on: i.on })),
    items: s.menu.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      label: labelPair(i.label, words),
      cat: i.cat ?? '',
      href: i.href ?? '',
      editHref: i.kind === 'link',
      on: i.on,
      desk: i.desk,
      phone: i.phone,
      builtIn: builtItem.has(i.id),
    })),
  };
}

export const ALL_SOCIAL = ['facebook', 'instagram', 'youtube', 'tiktok', 'whatsapp'] as const;
export const ALL_PAY = ['bkash', 'nagad', 'visa', 'mc', 'cod', 'rocket', 'amex', 'ssl', 'upay', 'bank'] as const;

/** Every mark the footer knows, the shown ones first in the owner's order, the rest hidden behind them. */
function marks(stored: readonly { id: string; on: boolean }[], all: readonly string[]): MarkRow[] {
  const have = new Set(stored.map((x) => x.id));
  return [...stored.map((x) => ({ id: x.id, on: x.on })), ...all.filter((id) => !have.has(id)).map((id) => ({ id, on: false }))];
}

export function footerCard(
  footer: ShellFooter,
  defaults: ShellFooter,
  urls: FooterCardValue['urls'],
  words: Words,
): FooterCardValue {
  const builtPromise = idsOf(defaults.promise.items);
  const builtCol = idsOf(defaults.columns);
  const builtLink = new Set(defaults.columns.flatMap((c) => c.links.map((l) => l.id)));
  return {
    promiseOn: footer.promise.on,
    promise: footer.promise.items.map((p) => ({ id: p.id, text: labelPair(p.text, words) ?? { en: '', bn: '' }, on: p.on, builtIn: builtPromise.has(p.id) })),
    joinOn: footer.join.on,
    columns: footer.columns.map((c) => ({
      id: c.id,
      title: labelPair(c.title, words) ?? { en: '', bn: '' },
      on: c.on,
      builtIn: builtCol.has(c.id),
      links: c.links.map((l) => ({
        id: l.id,
        label: labelPair(l.label, words),
        cat: l.cat ?? '',
        href: l.href ?? '',
        editHref: !l.cat && !l.act,
        on: l.on,
        builtIn: builtLink.has(l.id),
      })),
    })),
    contact: { ...footer.contact },
    social: marks(footer.social, ALL_SOCIAL),
    urls,
    pay: marks(footer.pay, ALL_PAY),
    copyright: labelPair(footer.legal.copyright, words) ?? { en: '', bn: '' },
  };
}

// ---- moving rows (drag, touch and the keyboard's arrows all end here) ----

/** One row moved by `delta` places inside its list (a move past either end changes nothing). */
export function moveBy<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length || delta === 0) return [...list];
  const next = [...list];
  const [row] = next.splice(index, 1);
  next.splice(to, 0, row as T);
  return next;
}

/** One row put into `list` just before the row with id `before` (null: at the end), taken out of wherever it was. */
export function dropInto<T extends { id: string }>(list: readonly T[], row: T, before: string | null): T[] {
  const rest = list.filter((x) => x.id !== row.id);
  const at = before === null ? rest.length : rest.findIndex((x) => x.id === before);
  rest.splice(at < 0 ? rest.length : at, 0, row);
  return rest;
}

/** Footer links dragged from one column to another (or inside one): the row leaves its column and lands before `before`. */
export function moveLink(columns: readonly FooterColumnRow[], from: { list: string; id: string }, to: { list: string; before: string | null }): FooterColumnRow[] {
  const src = columns.find((c) => c.id === from.list);
  const link = src?.links.find((l) => l.id === from.id);
  if (!src || !link || !columns.some((c) => c.id === to.list)) return [...columns];
  const MAX_LINKS = 12;
  const target = columns.find((c) => c.id === to.list);
  if (target && target.id !== src.id && target.links.length >= MAX_LINKS) return [...columns];
  return columns.map((c) => {
    if (c.id === src.id && c.id === to.list) return { ...c, links: dropInto(c.links, link, to.before) };
    if (c.id === src.id) return { ...c, links: c.links.filter((l) => l.id !== link.id) };
    if (c.id === to.list) return { ...c, links: dropInto(c.links, link, to.before) };
    return c;
  });
}

/** A fresh id for something the owner adds (lower-case letters, digits and dashes, at most 40). */
export function newId(prefix: string, taken: readonly string[], seed: number): string {
  let n = seed;
  let id = `${prefix}-${n.toString(36)}`;
  while (taken.includes(id)) id = `${prefix}-${(++n).toString(36)}`;
  return id.slice(0, 40);
}
