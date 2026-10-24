// PR 503 — every word the shop shows comes from the shop dictionary (messages/shop.<lang>.json), never from code. The
// owner can change any of them, in both languages, through the setting `language.labels` (his words win over ours).
// Text in a dictionary may hold {name} slots, filled at the moment it is shown.
// The third storefront batch (S02, PR 53, 67–71, 74, 75) keeps its words in messages/shop-more.<lang>.json, merged in
// here under their own top-level keys (a key in both files is a mistake and throws). Search (S02, PR 72/73) keeps its
// words in messages/shop-search.<lang>.json, the storefront follow-ups theirs in messages/shop-fu.<lang>.json, Find My
// Size (S02, PR 58, 51) in messages/shop-finder.<lang>.json under `finder` and the customer accounts (S04, PR 129–137)
// in messages/shop-account.<lang>.json (`account.*`) and the combo storefront (S03, PR 91–95, 102, 103) in
// messages/shop-combo.<lang>.json (`combo.*`), "Build your own set" (S03, PR 98, 100) in
// messages/shop-build.<lang>.json (`build.*`) and the bulk / corporate lane (S04, PR 606) in
// messages/shop-bulk.<lang>.json (`bulk.*`), merged the same way.
import bn from '../../../messages/shop.bn.json';
import en from '../../../messages/shop.en.json';
import moreBn from '../../../messages/shop-more.bn.json';
import moreEn from '../../../messages/shop-more.en.json';
import searchBn from '../../../messages/shop-search.bn.json';
import searchEn from '../../../messages/shop-search.en.json';
import fuBn from '../../../messages/shop-fu.bn.json';
import fuEn from '../../../messages/shop-fu.en.json';
import finderBn from '../../../messages/shop-finder.bn.json';
import finderEn from '../../../messages/shop-finder.en.json';
import accountBn from '../../../messages/shop-account.bn.json';
import accountEn from '../../../messages/shop-account.en.json';
import comboBn from '../../../messages/shop-combo.bn.json';
import comboEn from '../../../messages/shop-combo.en.json';
import buildBn from '../../../messages/shop-build.bn.json';
import buildEn from '../../../messages/shop-build.en.json';
import bulkBn from '../../../messages/shop-bulk.bn.json';
import bulkEn from '../../../messages/shop-bulk.en.json';
import type { ShopLabel } from '@extas/settings';
import type { Dict } from '../i18n';
import type { ShopLang } from './lang';

function withMore(base: Dict, more: Dict): Dict {
  for (const k of Object.keys(more)) if (k in base) throw new Error(`shop words "${k}" are defined twice`);
  return { ...base, ...more };
}

export const SHOP_DICTS: Record<ShopLang, Dict> = {
  en: withMore(withMore(withMore(withMore(withMore(withMore(withMore(withMore(en, moreEn), searchEn), fuEn), finderEn), accountEn), comboEn), buildEn), bulkEn),
  bn: withMore(withMore(withMore(withMore(withMore(withMore(withMore(withMore(bn, moreBn), searchBn), fuBn), finderBn), accountBn), comboBn), buildBn), bulkBn),
};

export type LabelOverrides = Record<string, { en?: string; bn?: string }>;
export type Vars = Record<string, string | number>;

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

export function fill(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (m, v: string) => (v in vars ? String(vars[v]) : m));
}

/** Every dotted key of a dictionary (tests keep both languages equal). */
export function keysOf(dict: Dict, at = ''): string[] {
  return Object.entries(dict).flatMap(([k, v]) => (typeof v === 'string' ? [`${at}${k}`] : keysOf(v, `${at}${k}.`)));
}

export interface ShopT {
  lang: ShopLang;
  /** The words at a key, with {slots} filled. A missing key shows the key itself, so a gap is visible, never blank. */
  (key: string, vars?: Vars): string;
  /** Words from a setting: a dictionary key, or the owner's own {en, bn}. */
  label(l: ShopLabel | undefined, vars?: Vars, fallbackKey?: string): string;
  /** Whether the dictionary (or the owner) has words at a key. */
  has(key: string): boolean;
}

export function shopT(lang: ShopLang, overrides: LabelOverrides | null = null): ShopT {
  const dict = SHOP_DICTS[lang];
  const own = (key: string) => overrides?.[key]?.[lang];
  const raw = (key: string) => own(key) ?? lookup(dict, key) ?? (lang === 'bn' ? lookup(SHOP_DICTS.en, key) : undefined);
  const t = ((key: string, vars: Vars = {}) => fill(raw(key) ?? key, vars)) as ShopT;
  t.lang = lang;
  t.has = (key) => raw(key) !== undefined;
  t.label = (l, vars = {}, fallbackKey) => {
    if (!l) return fallbackKey ? t(fallbackKey, vars) : '';
    if ('key' in l) return t(l.key, vars);
    return fill(l[lang] || l.en, vars);
  };
  return t;
}
