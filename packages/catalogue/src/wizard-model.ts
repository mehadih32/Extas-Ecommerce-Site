// S28 · PR 1030 — the add-product wizard's pure rules (prototype v5, "Add product", 8 steps). No database here: the same
// answers give the same result, so the screen, the server and the tests agree.
// - The category's detail questions (what to ask for a polo, a pair of trousers …) are keys; the words are messages
//   (`products.wiz.det.<key>`), and a garment type the list does not know asks for the fabric only.
// - Profit is worked out from the buying price the ERP gives, never typed.
// - The size finder starts empty for a style with no chart: the owner's own height and weight cuts are never made up.

import type { FinderRow } from './size-chart-math';

export const WIZARD_KINDS = ['SINGLE', 'SET'] as const;
export type WizardKind = (typeof WIZARD_KINDS)[number];
export const WIZARD_LINKS = ['SAME', 'ANY'] as const;
export type WizardLink = (typeof WIZARD_LINKS)[number];
export const WIZARD_FOR = ['MEN', 'BOYS', 'UNISEX'] as const;
export type WizardFor = (typeof WIZARD_FOR)[number];
export const WIZARD_FITS = ['SLIM', 'REGULAR', 'RELAXED', 'OVERSIZED'] as const;
export type WizardFit = (typeof WIZARD_FITS)[number];
export const WIZARD_RUNS = ['SMALL', 'TRUE', 'LARGE'] as const;
export type WizardRun = (typeof WIZARD_RUNS)[number];

/** The detail questions asked for each garment type, in order (the words are `products.wiz.det.<key>`). */
export const DETAIL_SETS: Record<string, readonly string[]> = {
  // hardcode-ok: the starting question list of the default pack's garment types; the answers are the owner's.
  polo: ['fabric', 'gsm', 'collar', 'sleeve'],
  tee: ['fabric', 'gsm', 'neck', 'sleeve'],
  shirt: ['fabric', 'collar', 'sleeve', 'pocket'],
  panjabi: ['fabric', 'work', 'length', 'button'],
  trouser: ['fabric', 'rise', 'stretch', 'closure'],
  hoodie: ['fabric', 'gsm', 'hood', 'zip'],
  accessory: ['material', 'size'],
};
const FALLBACK_DETAILS: readonly string[] = ['fabric'];

export function detailKeysFor(garmentKey: string | null | undefined): readonly string[] {
  return (garmentKey && DETAIL_SETS[garmentKey]) || FALLBACK_DETAILS;
}

/** The kinds of garment that are worn on the legs: a set's bottom piece comes from these. */
export const BOTTOM_GARMENT_KEYS: readonly string[] = ['trouser']; // hardcode-ok: the default pack's bottom garment type

export interface ProfitView {
  /** Profit per piece in minor units. */
  profitMinor: number;
  /** Profit as a share of the selling price, 0-100 with one decimal. */
  marginPct: number;
  /** True when the selling price is not above the buying price. */
  belowCost: boolean;
}

export function profitOf(priceMinor: number, costMinor: number): ProfitView {
  const profitMinor = priceMinor - costMinor;
  const marginPct = priceMinor > 0 ? Math.round((profitMinor / priceMinor) * 1000) / 10 : 0;
  return { profitMinor, marginPct, belowCost: priceMinor > 0 && priceMinor <= costMinor };
}

/** The name suggested on the site: the brand (when it is not the shop's own) before the ERP name, and the sub-category after a short one. */
export function suggestName(o: { brand: string | null; ownBrand: string | null; erpName: string; sub: string | null }): string {
  const erp = o.erpName.trim();
  const brand = o.brand && o.brand !== o.ownBrand && !erp.startsWith(o.brand) ? `${o.brand} ` : '';
  const shortName = erp.split(/\s+/).filter(Boolean).length < 3 && o.sub ? ` ${o.sub}` : '';
  return `${brand}${erp}${shortName}`.trim();
}

/** The search word suggested for a product: its category's name (with the brand when it is not the shop's own) and the place. */
export function suggestKeyword(o: { brand: string | null; ownBrand: string | null; categoryName: string; place: string }): string {
  const b = o.brand && o.brand !== o.ownBrand ? `${o.brand.toLowerCase()} ` : '';
  return `${b}${o.categoryName.toLowerCase()} ${o.place}`.trim();
}

/** The link: lowercase letters, digits and single hyphens. */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** One empty finder row per size, keeping rows already filled in for a size that is still there. */
export function finderRows(sizes: string[], current: FinderRow[] | null | undefined): FinderRow[] {
  const have = new Map((current ?? []).map((r) => [r.size, r]));
  return sizes.map((size) => have.get(size) ?? { size, h1: '', h2: '', w1: 0, w2: 0 });
}

export type WizardCheckKey = 'title' | 'description' | 'keyword' | 'ownText' | 'alt' | 'slug' | 'place';

export interface WizardSeoInput {
  title: string;
  description: string;
  keyword: string;
  /** The description on the page (the owner's own text). */
  pageText: string;
  slug: string;
  /** Colours shown on the shop that have no front photo. */
  coloursWithoutFront: number;
}

export interface WizardSeo {
  score: number;
  band: 'good' | 'ok' | 'weak';
  checks: { key: WizardCheckKey; ok: boolean }[];
}

/** The prototype's seven Google checks (title 30-60, description 120-160, the search word in the title, the page text, alt text, the link, the place). */
const SEO_COST: Record<WizardCheckKey, number> = { title: 15, description: 15, keyword: 15, ownText: 10, alt: 10, slug: 5, place: 10 };

export function wizardSeo(i: WizardSeoInput, place: RegExp): WizardSeo {
  const title = i.title.trim();
  const desc = i.description.trim();
  const kw = i.keyword.trim().toLowerCase();
  const checks: WizardSeo['checks'] = [
    { key: 'title', ok: title.length >= 30 && title.length <= 60 },
    { key: 'description', ok: desc.length >= 120 && desc.length <= 160 },
    { key: 'keyword', ok: !!kw && title.toLowerCase().includes(kw.split(/\s+/)[0]!) },
    { key: 'ownText', ok: i.pageText.trim().length >= 80 },
    { key: 'alt', ok: i.coloursWithoutFront === 0 },
    { key: 'slug', ok: i.slug.length > 0 && i.slug.length <= 50 },
    { key: 'place', ok: place.test(desc) },
  ];
  const score = Math.max(10, 100 - checks.filter((c) => !c.ok).reduce((n, c) => n + SEO_COST[c.key], 0));
  return { score, band: score >= 80 ? 'good' : score >= 60 ? 'ok' : 'weak', checks };
}

export interface WizardSteps {
  name: string;
  hasCategory: boolean;
  colours: number;
  coloursWithoutFront: number;
  priceMinor: number;
  costMinor: number;
  priceConfirmed: boolean;
  description: string;
  hasGoogleText: boolean;
  kind: WizardKind;
  hasBottom: boolean;
  hasStyle: boolean;
}

/** Which of the first seven steps are done, and the eighth (all of them), as the prototype counts them. */
export function stepFlags(s: WizardSteps): { ok: boolean; miss: string }[] {
  const flags = [
    { ok: s.hasStyle && (s.kind !== 'SET' || s.hasBottom), miss: s.kind === 'SET' && !s.hasBottom ? 'bottom' : 'style' },
    { ok: s.name.trim().length >= 3 && s.hasCategory, miss: 'name' },
    { ok: s.colours > 0, miss: 'colours' },
    { ok: s.colours > 0 && s.coloursWithoutFront === 0, miss: 'photos' },
    { ok: s.priceMinor > s.costMinor && s.priceConfirmed, miss: s.priceMinor > s.costMinor ? 'pin' : 'price' },
    { ok: s.description.trim().length >= 40, miss: 'description' },
    { ok: s.hasGoogleText, miss: 'google' },
  ];
  return [...flags, { ok: flags.every((f) => f.ok), miss: '' }];
}

/** Publishing needs a front photo for every colour and a confirmed price above the buying price; the rest only warns. */
export function canPublish(s: WizardSteps): boolean {
  return s.colours > 0 && s.coloursWithoutFront === 0 && s.priceMinor > s.costMinor && s.priceConfirmed;
}
