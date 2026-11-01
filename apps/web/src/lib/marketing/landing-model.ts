// S13 · PR 254 (Blueprint MKT-05, demo 97x-adm2-marketing.js X2_LPS and 70-landing.js) — the landing page's parts, pure.
//
// - A landing page is a Page row of kind LANDING: a headline (English, Bengali optional), its link /l/<slug>, the one
//   product it sells and optionally the campaign it belongs to. Its parts are PageSection rows (layout scope PAGE).
// - The parts come in a fixed order (the order that sells best, demo "the order is fixed"); each one is switched on or
//   off. Every page starts with the demo's defaults: all on except the countdown.
// - The words a part needs (the offer line, the reasons to buy, the countdown's end) are the owner's, in the part's
//   config. Prices are never typed here: the page shows the product's own live prices and the shop's own rules.
import { z } from 'zod';

export const LANDING_SECTIONS = ['hero', 'gallery', 'benefits', 'size', 'reviews', 'form', 'faq', 'timer'] as const;
export type LandingSectionKey = (typeof LANDING_SECTIONS)[number];

/** Which parts a new page starts with (demo X2_LPS): everything but the countdown. */
export const SECTION_DEFAULT_ON: Record<LandingSectionKey, boolean> = {
  hero: true,
  gallery: true,
  benefits: true,
  size: true,
  reviews: true,
  form: true,
  faq: true,
  timer: false,
};

/** The PageSection.type a part is stored under. */
export const sectionType = (k: LandingSectionKey) => `landing.${k}`;
export const sectionKeyOf = (type: string): LandingSectionKey | null => {
  const k = type.startsWith('landing.') ? type.slice('landing.'.length) : '';
  return (LANDING_SECTIONS as readonly string[]).includes(k) ? (k as LandingSectionKey) : null;
};

/** The link part: lower-case letters, digits and single hyphens (the demo's slug rule). */
export const SLUG_MAX = 60; // hardcode-ok: the length of a link, not a business number
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const words = z.object({ en: text(160), bn: optText(160) }).strict();

/** One part's own words (only the parts that have any). */
export const sectionConfigSchema = z
  .object({
    /** hero: a short offer line under the headline ("Any 2 colours, cash on delivery"). */
    offer: z.object({ en: optText(120), bn: optText(120) }).strict().optional(),
    /** benefits: the reasons to buy, one per line. */
    lines: z.array(words).max(6).optional(),
    /** timer: when the countdown ends (it hides itself after). */
    endsAt: z.string().datetime({ offset: true }).nullish(),
  })
  .strict();
export type SectionConfig = z.output<typeof sectionConfigSchema>;

export const sectionInputSchema = z.object({ on: z.boolean(), config: sectionConfigSchema.optional() }).strict();

export const landingInputSchema = z
  .object({
    titleEn: text(120).min(1),
    titleBn: optText(120),
    slug: z.string().trim().min(1).max(SLUG_MAX).regex(SLUG_RE),
    productId: z.string().uuid(),
    campaignId: z.string().uuid().nullish().transform((v) => v ?? null),
    sections: z.partialRecord(z.enum(LANDING_SECTIONS), sectionInputSchema),
    /** The page's version as it was read (its updatedAt); null for a new page. */
    version: z.string().nullish().transform((v) => v ?? null),
  })
  .strict();
export type LandingInput = z.output<typeof landingInputSchema>;

export const LANDING_ACTIONS = ['publish', 'unpublish', 'archive', 'restore'] as const;
export type LandingAction = (typeof LANDING_ACTIONS)[number];

export interface LandingSection {
  key: LandingSectionKey;
  on: boolean;
  config: SectionConfig;
}

/** The page's parts in their fixed order: the stored row of each, else its default (a part never stored is new). */
export function sectionsOf(rows: readonly { type: string; isVisible: boolean; config: unknown; archivedAt?: Date | null }[]): LandingSection[] {
  const by = new Map<LandingSectionKey, { isVisible: boolean; config: unknown }>();
  for (const r of rows) {
    const k = sectionKeyOf(r.type);
    if (k && !r.archivedAt && !by.has(k)) by.set(k, r);
  }
  return LANDING_SECTIONS.map((key) => {
    const r = by.get(key);
    const c = sectionConfigSchema.safeParse(r?.config ?? {});
    return { key, on: r ? r.isVisible : SECTION_DEFAULT_ON[key], config: c.success ? c.data : {} };
  });
}

export type PageState = 'live' | 'draft' | 'off' | 'archived';

/** What the list says about a page: archived, live (published), taken down, or a draft never published. */
export function stateOf(p: { status: string; archivedAt: Date | null }): PageState {
  if (p.archivedAt || p.status === 'ARCHIVED') return 'archived';
  if (p.status === 'PUBLISHED') return 'live';
  if (p.status === 'UNPUBLISHED') return 'off';
  return 'draft';
}

/** The countdown: whole seconds left, or null once it has ended (or when no end is set). */
export function secondsLeft(endsAt: string | null | undefined, now: Date): number | null {
  if (!endsAt) return null;
  const s = Math.floor((new Date(endsAt).getTime() - now.getTime()) / 1000);
  return Number.isFinite(s) && s > 0 ? s : null;
}

/** The bag line's source that ties an item to its landing page, read again when the order is placed (@extas/checkout
 * LANDING_LINE_SOURCE; kept here as text so the builder's client code never loads the checkout; a test keeps them equal). */
export const LANDING_SOURCE_PREFIX = 'lp-';
export const landingSource = (pageId: string) => `${LANDING_SOURCE_PREFIX}${pageId}`;

/**
 * SIM-F-034: the landing page promises "try it on in front of the rider" exactly when the shop does elsewhere — the
 * checkout's switch (`checkout.tryOn.enabled`) or the product page's line (`pdp.rules` on with `trialLine`).
 */
export function showsTryOn(set: { tryOn: boolean; rules: { on: boolean; trialLine: boolean } }): boolean {
  return set.tryOn || (set.rules.on && set.rules.trialLine);
}
