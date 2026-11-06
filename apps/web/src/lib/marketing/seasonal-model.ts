// S12 · PR 246 (Blueprint answer 15 "Eid, winter, Puja"; C12 URL map "seasonal /collections/<slug>"; demo 73-blog.js
// "Occasions & seasons") — the seasonal landing page's parts, pure (safe in the admin's browser code and the shop).
//
// - A seasonal page is a Page row of kind SEASONAL, kept for good and used again each year: a headline and an intro
//   (English, Bengali optional), its link /collections/<slug> and the occasion it is for (one of the owner's occasions,
//   `marketing.seasonal`; kept in Page.recurrence as {occasion}, where PR 530 adds its yearly return). Its parts are
//   PageSection rows (layout scope PAGE, type `seasonal.<part>`), in a fixed order, each switched on or off — the same
//   way as the ad landing pages (landing-model.ts, PR 254), whose link rule, states and steps it shares.
// - The parts: the hero (headline, the owner's offer line, the intro), the order-by line (the shop's Eid rule, PR 214,
//   for the occasions the owner lists), a countdown, the products of the seasonal collection it names (PR 32), the
//   owner's reasons (one per line) and the newest live journal articles of the journal category it names.
// - Prices are never typed here: the products show their own live prices.
import { z } from 'zod';
import { SLUG_MAX, SLUG_RE, type PageState } from './landing-model';

export { LANDING_ACTIONS as SEASONAL_ACTIONS, slugify, stateOf, secondsLeft, SLUG_MAX, SLUG_RE, type LandingAction as SeasonalAction, type PageState } from './landing-model';

export const SEASONAL_SECTIONS = ['hero', 'cutoff', 'timer', 'products', 'reasons', 'articles'] as const;
export type SeasonalSectionKey = (typeof SEASONAL_SECTIONS)[number];

/** Which parts a new page starts with: everything but the countdown and the reasons (they need the owner's words). */
export const SEASONAL_DEFAULT_ON: Record<SeasonalSectionKey, boolean> = {
  hero: true,
  cutoff: true,
  timer: false,
  products: true,
  reasons: false,
  articles: true,
};

export const seasonalType = (k: SeasonalSectionKey) => `seasonal.${k}`;
export const seasonalKeyOf = (type: string): SeasonalSectionKey | null => {
  const k = type.startsWith('seasonal.') ? type.slice('seasonal.'.length) : '';
  return (SEASONAL_SECTIONS as readonly string[]).includes(k) ? (k as SeasonalSectionKey) : null;
};

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optId = z
  .string()
  .uuid()
  .nullish()
  .transform((v) => v ?? null);

/** One part's own words or choice (only the parts that have any). */
export const seasonalConfigSchema = z
  .object({
    /** hero: a short line under the headline ("Order by the 20th for delivery before Eid"). */
    offer: z.object({ en: optText(120), bn: optText(120) }).strict().optional(),
    /** reasons: one per line. */
    lines: z
      .array(z.object({ en: text(160), bn: optText(160) }).strict())
      .max(6)
      .optional(),
    /** timer: when the countdown ends (it hides itself after). */
    endsAt: z.string().datetime({ offset: true }).nullish(),
    /** products: the seasonal collection the page shows. */
    collectionId: optId.optional(),
    /** articles: the journal category whose newest live articles the page lists. */
    categoryId: optId.optional(),
  })
  .strict();
export type SeasonalConfig = z.output<typeof seasonalConfigSchema>;

export const seasonalSectionInputSchema = z.object({ on: z.boolean(), config: seasonalConfigSchema.optional() }).strict();

export const OCCASION_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const INTRO_MAX = 600; // hardcode-ok: the length of a paragraph, not a business number

export const seasonalInputSchema = z
  .object({
    titleEn: text(120).min(1),
    titleBn: optText(120),
    slug: z.string().trim().min(1).max(SLUG_MAX).regex(SLUG_RE),
    occasion: z.string().trim().min(1).max(30).regex(OCCASION_RE),
    introEn: optText(INTRO_MAX),
    introBn: optText(INTRO_MAX),
    sections: z.partialRecord(z.enum(SEASONAL_SECTIONS), seasonalSectionInputSchema),
    /** The page's version as it was read (its updatedAt); null for a new page. */
    version: z.string().nullish().transform((v) => v ?? null),
  })
  .strict();
export type SeasonalInput = z.output<typeof seasonalInputSchema>;

export interface SeasonalSection {
  key: SeasonalSectionKey;
  on: boolean;
  config: SeasonalConfig;
}

/** The page's parts in their fixed order: the stored row of each, else its default (a part never stored is new). */
export function seasonalSectionsOf(rows: readonly { type: string; isVisible: boolean; config: unknown; archivedAt?: Date | null }[]): SeasonalSection[] {
  const by = new Map<SeasonalSectionKey, { isVisible: boolean; config: unknown }>();
  for (const r of rows) {
    const k = seasonalKeyOf(r.type);
    if (k && !r.archivedAt && !by.has(k)) by.set(k, r);
  }
  return SEASONAL_SECTIONS.map((key) => {
    const r = by.get(key);
    const c = seasonalConfigSchema.safeParse(r?.config ?? {});
    return { key, on: r ? r.isVisible : SEASONAL_DEFAULT_ON[key], config: c.success ? c.data : {} };
  });
}

/** The occasion a page is for, from Page.recurrence ({occasion}); null when none was kept. */
export function occasionOf(recurrence: unknown): string | null {
  const o = recurrence && typeof recurrence === 'object' ? (recurrence as Record<string, unknown>).occasion : null;
  return typeof o === 'string' && OCCASION_RE.test(o) ? o : null;
}

export interface OccasionName {
  key: string;
  en: string;
  bn: string;
}

/** An occasion's name in the language asked (its key when the owner has since removed it from his list). */
export function occasionName(list: readonly OccasionName[], key: string | null, lang: 'en' | 'bn'): string {
  const o = list.find((x) => x.key === key);
  return o ? o[lang] || o.en : (key ?? '');
}

/** The order-by line shows on a page whose occasion the owner listed (`cutoffOccasions`). */
export const showsCutoff = (set: { cutoffOccasions: Readonly<Record<string, boolean>> }, occasion: string | null) => !!occasion && set.cutoffOccasions[occasion] === true;

export type SeasonalServe = 'live' | 'resting';

/**
 * What the shop answers at a seasonal page's link: the page (switch on, published, not archived); its resting page (switch
 * on, `offSeason` on, live once and now taken down or put away — PR 527: a link that was live never answers "not found");
 * PR 530: a taken-down page that is `back` for its occasion (its yearly return) answers live;
 * otherwise nothing (a draft never live, or the switch off).
 */
export function seasonalServe(p: { status: string; archivedAt: Date | null; publishedAt: Date | null }, set: { enabled: boolean; offSeason: boolean }, back = false): SeasonalServe | null {
  if (!set.enabled) return null;
  // PR 530: `back` — a taken-down page inside its occasion's window with its yearly return on (seasonal-return-model.ts)
  if ((p.status === 'PUBLISHED' || back) && !p.archivedAt) return 'live';
  return set.offSeason && p.publishedAt ? 'resting' : null;
}

/** Why a page cannot go live as it is (empty = it can): its products part needs its collection. */
export function publishIssues(sections: readonly SeasonalSection[]): string[] {
  const out: string[] = [];
  const pr = sections.find((s) => s.key === 'products');
  if (pr?.on && !pr.config.collectionId) out.push('collectionId');
  const ar = sections.find((s) => s.key === 'articles');
  if (ar?.on && !ar.config.categoryId) out.push('categoryId');
  return out;
}

export type { PageState as SeasonalState };
