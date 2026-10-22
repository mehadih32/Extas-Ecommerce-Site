// PR 41 / 43 — the home page as data, ready to draw: which sections show and in what order, the hero's words, buttons
// and promise lines, which products the hero's pictures show (PR 43), and what a product card prints (badge, swatches,
// the struck price). Plain functions over the settings
// (`home.*`) and the catalogue, so the rules are unit-tested and the components only draw. The rules are the approved
// demo's (docs/demo/src/20-home.js hm_hero, hm_heroBtns, hm_heroTrust, HOME_SECTIONS; 02-core.js productCard).
import type { HomeHero, HomeSections, HomeSectionId, ShopIcon } from '@extas/settings';
import type { ShopT, Vars } from './dict';
import { hrefIn } from './lang';
import { requirementsMet, type Flags } from './shell-model';
import type { ShopCard, ShopColour } from './catalogue';
import { COLOUR_QUERY } from './routes';

/** The sections switched on, in the owner's order (an id the list does not name stays off). */
export function homeSectionsOn(list: HomeSections): HomeSectionId[] {
  return list.filter((s) => s.on).map((s) => s.id);
}

// ---- the hero ----

export interface HeroButton {
  id: string;
  label: string;
  href: string;
  className: string;
}

/** The demo's three button looks: the translucent fill, the "sets" look the owner picked, an outline. */
export function heroButtonClass(style: HomeHero['buttons'][number]['style'], setsLook: HomeHero['setsLook']): string {
  if (style === 'fill') return 'btn hm-btn-light';
  if (style === 'sets') return `btn hm-btn-line hm-sets-${setsLook}`;
  return 'btn hm-btn-line';
}

export function heroButtons(hero: HomeHero, t: ShopT, vars: Vars): HeroButton[] {
  return hero.buttons
    .filter((b) => b.on)
    .map((b) => ({ id: b.id, label: t.label(b.label, vars), href: hrefIn(t.lang, b.href), className: heroButtonClass(b.style, hero.setsLook) }))
    .filter((b) => b.label.trim().length > 0);
}

export interface HeroTrust {
  id: string;
  icon: ShopIcon;
  /** The phone's words, and the desktop's own wording (the same words when none is set). */
  text: string;
  desk: string;
}

/** Honesty: a promise line shows only once the owner has switched its rule on (COD, exchange). */
export function heroTrust(hero: HomeHero, flags: Flags, t: ShopT, vars: Vars): HeroTrust[] {
  return hero.trust
    .filter((x) => x.on && requirementsMet(x.requires, flags))
    .map((x) => {
      const text = t.label(x.text, vars);
      return { id: x.id, icon: x.icon, text, desk: x.desk ? t.label(x.desk, vars) || text : text };
    })
    .filter((x) => x.text.trim().length > 0);
}

/** H1 · on a desktop each sentence of the hero's line takes its own line (Latin and Bengali full stops). */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---- product cards ----

/** The badge on the photo: the saving when the honesty rule allows a struck price, else the product's first tag. */
export function cardBadge(card: Pick<ShopCard, 'priceMinor' | 'wasMinor' | 'badge'>, t: ShopT, num: (n: number) => string): { text: string; sale: boolean } | null {
  if (card.priceMinor != null && card.wasMinor != null && card.wasMinor > card.priceMinor) {
    const pct = Math.round((1 - card.priceMinor / card.wasMinor) * 100);
    if (pct > 0) return { text: t('card.off', { n: num(pct) }), sale: true };
  }
  return card.badge ? { text: card.badge, sale: false } : null;
}

/** The swatches a card draws (the demo's four) and how many more colours there are. */
export function cardSwatches(colours: readonly ShopColour[], max = 4): { shown: ShopColour[]; more: number } {
  return { shown: colours.slice(0, max), more: Math.max(0, colours.length - max) };
}

/** A product's own address: the owner's prefix (`naming.productPathPrefix`) and the product's slug. */
export function productPath(prefix: string, slug: string): string {
  return `${prefix.replace(/\/+$/, '') || ''}/${encodeURIComponent(slug)}`;
}

/** The product's address opened on one colour (the hero's pictures). */
export function productColourPath(prefix: string, slug: string, colourKey: string | null | undefined): string {
  const base = productPath(prefix, slug);
  return colourKey ? `${base}?${COLOUR_QUERY}=${encodeURIComponent(colourKey)}` : base;
}

// ---- the hero's pictures (PR 43) ----

export interface HeroPick {
  card: ShopCard;
  colour: ShopColour | null;
}

/**
 * One category's pictures in the order they are offered: every product in its first colour, then every product in its
 * second colour, and so on — so two pictures from one category are two products when it has two (the demo's list:
 * a panjabi in white and, later, in maroon). A product without a price has no pin, so it gives none.
 */
export function slideCandidates(cards: readonly ShopCard[]): HeroPick[] {
  const priced = cards.filter((c) => c.priceMinor != null);
  const most = Math.max(1, ...priced.map((c) => c.colours.length));
  const out: HeroPick[] = [];
  for (let i = 0; i < most; i++) {
    for (const card of priced) {
      if (i === 0 || card.colours[i]) out.push({ card, colour: card.colours[i] ?? null });
    }
  }
  return out;
}

/**
 * The hero's pictures (§57.1): taken in turns, one from each category per round, so every category shows before any
 * shows twice; at most `perCategory` from one, `count` in all. A collection (a campaign) is one group with no per-group
 * limit. The same product in the same colour never shows twice.
 */
export function heroSlidePicks(groups: readonly (readonly ShopCard[])[], count: number, perCategory: number): HeroPick[] {
  const queues = groups.map((g) => ({ list: slideCandidates(g), at: 0, used: 0 }));
  const seen = new Set<string>();
  const out: HeroPick[] = [];
  for (let progress = true; progress && out.length < count; ) {
    progress = false;
    for (const q of queues) {
      if (out.length >= count) break;
      if (q.used >= perCategory) continue;
      while (q.at < q.list.length) {
        const pick = q.list[q.at++]!;
        const id = `${pick.card.id}:${pick.colour?.key ?? ''}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(pick);
        q.used++;
        progress = true;
        break;
      }
    }
  }
  return out;
}

// ---- reviews ----

/** The star row: each of five stars filled up to the rounded rating (demo starsHTML). */
export function starFills(rating: number): boolean[] {
  const r = Math.round(rating);
  return [1, 2, 3, 4, 5].map((i) => i <= r);
}
