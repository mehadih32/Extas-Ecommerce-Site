// S13 · PR 270 (register "Ad creative briefs generated from the product and the campaign"; demo 93-admin-ads.js
// `zd-brief`) — the brief's thinking, with no database: from one product (its price, its honest compare-at price and its
// colours), the owner's brief settings (`ads.creativeBrief`, registry v176), the words of both languages and, when known,
// what the ads brought back for that product (delivered ROAS, @extas/metrics), a draft the studio can work from:
//   - the offer: the product's lowest price, the compare-at price only when it is higher, and its colours;
//   - the formats: a 4:5 photo, a 1:1 carousel of `carouselCards` cards, a 9:16 video of `videoMinSeconds`–
//     `videoMaxSeconds` seconds (each one switchable);
//   - a hook in Bengali and one in English, and what the picture shows (no words on it when `noTextOnPicture`);
//   - the landing address (the product's own page) and what the ads optimise for.
// The person corrects the hooks and the picture line before it goes to the studio; nothing here sets a price.
import type { AdsCreativeBriefSettings } from '@extas/settings';

export const BRIEF_LANGS = ['en', 'bn'] as const;
export type BriefLang = (typeof BRIEF_LANGS)[number];
/** The longest hook or picture line a person may type (one ad's primary text stays short). */
export const BRIEF_TEXT_MAX = 300; // hardcode-ok: technical bound on one line of a brief

export type BriefFormat = { kind: 'photo'; ratio: '4:5' } | { kind: 'carousel'; ratio: '1:1'; cards: number } | { kind: 'video'; ratio: '9:16'; minSeconds: number; maxSeconds: number };

export interface BriefProduct {
  id: string;
  nameEn: string;
  nameBn: string | null;
  slug: string;
  /** The lowest price of its live variants (null: no price yet). */
  priceMinor: number | null;
  /** That variant's compare-at price (kept only when higher than the price). */
  compareAtMinor: number | null;
  colours: { nameEn: string; nameBn: string | null }[];
}

/** What the ads brought back for this product over the growth agent's days (null: nothing delivered yet). */
export interface BriefFigures {
  from: string;
  to: string;
  delivered: number;
  deliveredSalesMinor: number;
  roasPercent: number | null;
}

/** The template words of one language: `{name}`, `{price}`, `{colours}`. */
export interface BriefWords {
  hook: string;
  hookOne: string;
  show: string;
  noText: string;
}

/** A brief as it is kept (CreativeBrief.answers, kind 'ad'). */
export interface BriefAnswers {
  kind: 'ad';
  productId: string;
  adCampaignId: string | null;
  proposalId: string | null;
  currency: string;
  priceMinor: number | null;
  wasMinor: number | null;
  colours: { en: string[]; bn: string[] };
  formats: BriefFormat[];
  hooks: Record<BriefLang, string>;
  show: Record<BriefLang, string>;
  landingPath: string;
  optimiseFor: AdsCreativeBriefSettings['optimiseFor'];
  noTextOnPicture: boolean;
  figures: BriefFigures | null;
  sentAt?: string;
}

/** The formats the owner keeps on, in the demo's order. */
export function briefFormats(s: AdsCreativeBriefSettings): BriefFormat[] {
  const out: BriefFormat[] = [];
  if (s.photo) out.push({ kind: 'photo', ratio: '4:5' });
  if (s.carousel) out.push({ kind: 'carousel', ratio: '1:1', cards: s.carouselCards });
  if (s.video) out.push({ kind: 'video', ratio: '9:16', minSeconds: s.videoMinSeconds, maxSeconds: Math.max(s.videoMinSeconds, s.videoMaxSeconds) });
  return out;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const cut = (s: string) => s.trim().slice(0, BRIEF_TEXT_MAX);

/** The draft for one product. `money` writes an amount in a language; `pathPrefix` is `naming.productPathPrefix`. */
export function draftBrief(o: {
  product: BriefProduct;
  settings: AdsCreativeBriefSettings;
  words: Record<BriefLang, BriefWords>;
  money: (minor: number, lang: BriefLang) => string;
  pathPrefix: string;
  currency: string;
  figures: BriefFigures | null;
  adCampaignId?: string | null;
  proposalId?: string | null;
}): BriefAnswers {
  const p = o.product;
  const was = p.priceMinor !== null && p.compareAtMinor !== null && p.compareAtMinor > p.priceMinor ? p.compareAtMinor : null;
  const colours = { en: p.colours.map((c) => c.nameEn), bn: p.colours.map((c) => c.nameBn || c.nameEn) };
  const text = (lang: BriefLang) => {
    const w = o.words[lang];
    const vars = { name: (lang === 'bn' && p.nameBn) || p.nameEn, price: p.priceMinor === null ? '' : o.money(p.priceMinor, lang), colours: p.colours.length };
    const hook = cut(fill(p.colours.length > 1 ? w.hook : w.hookOne, vars));
    const show = cut(`${fill(w.show, vars)}${o.settings.noTextOnPicture ? ` ${w.noText}` : ''}`);
    return { hook, show };
  };
  const en = text('en');
  const bn = text('bn');
  return {
    kind: 'ad',
    productId: p.id,
    adCampaignId: o.adCampaignId ?? null,
    proposalId: o.proposalId ?? null,
    currency: o.currency,
    priceMinor: p.priceMinor,
    wasMinor: was,
    colours,
    formats: briefFormats(o.settings),
    hooks: { en: en.hook, bn: bn.hook },
    show: { en: en.show, bn: bn.show },
    landingPath: `${o.pathPrefix.replace(/\/+$/, '')}/${encodeURIComponent(p.slug)}`,
    optimiseFor: o.settings.optimiseFor,
    noTextOnPicture: o.settings.noTextOnPicture,
    figures: o.figures,
  };
}

/** A person's corrections: both hooks and both picture lines, trimmed and bounded (an empty one keeps the draft's). */
export function correctedBrief(a: BriefAnswers, edit: { hooks: Partial<Record<BriefLang, string>>; show: Partial<Record<BriefLang, string>> }): BriefAnswers {
  const pick = (now: Record<BriefLang, string>, next: Partial<Record<BriefLang, string>>) =>
    Object.fromEntries(BRIEF_LANGS.map((l) => [l, next[l] !== undefined && next[l]!.trim() ? cut(next[l]!) : now[l]])) as Record<BriefLang, string>;
  return { ...a, hooks: pick(a.hooks, edit.hooks), show: pick(a.show, edit.show) };
}
