// S12 · CN-031 lane A — seasonal landing pages (registry version 228, lane A's After-launch run). Off as it ships.
//   v228 · PR 246 `marketing.seasonal` — the permanent seasonal pages (Blueprint answer 15: Eid, winter, Puja; C12 URL
//          map "seasonal /collections/<slug>"), made in Marketing › Landing pages › Seasonal pages. The shop serves a
//          live one at /collections/<its link> (a category of the same link always wins) only while `enabled`. Each
//          page is for one of the owner's `occasions` (a link part and its name in both languages); a page of an
//          occasion listed in `cutoffOccasions` shows the shop's Eid order-by line (Rules › Eid, PR 214) while that rule
//          is on. The page's products come from the seasonal collection it names (PR 32), at most `productsMax`; its
//          journal part lists the newest live articles of the journal category it names, at most `articlesMax`. With
//          `offSeason` a page that has been live once and was taken down (or put away) keeps its link and says it comes
//          back for its occasion (PR 527: a page that was live never answers "not found").
import { z } from 'zod';
import { setting } from './define';

const V246 = 228;

/** An occasion's key: lower-case letters, digits and single hyphens (it is never shown; its names are). */
export const OCCASION_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const occasionName = z.string().trim().min(1).max(40);

export const seasonalSettingsSchema = z
  .object({
    /** The shop serves the seasonal pages that are live. */
    enabled: z.boolean(),
    /** The occasions a seasonal page can be for, each with its names. */
    occasions: z
      .array(z.object({ key: z.string().trim().min(1).max(30).regex(OCCASION_KEY_RE), en: occasionName, bn: occasionName }).strict())
      .min(1)
      .max(20)
      .refine((all) => new Set(all.map((o) => o.key)).size === all.length, { message: 'duplicate occasion' }),
    /** The occasions whose pages show the Eid order-by line (Rules › Eid) while that rule is on (key → yes). */
    cutoffOccasions: z.record(z.string().max(30).regex(OCCASION_KEY_RE), z.boolean()),
    /** The most products a page shows from its collection. */
    productsMax: z.int().min(1).max(60),
    /** The most journal articles a page lists. */
    articlesMax: z.int().min(1).max(12),
    /** A page that was live once and is taken down keeps its link and says it comes back for its occasion. */
    offSeason: z.boolean(),
  })
  .strict();
export type SeasonalSettings = z.output<typeof seasonalSettingsSchema>;

export const seasonalSettings = {
  'marketing.seasonal': setting({
    scope: 'store',
    schema: seasonalSettingsSchema,
    default: {
      enabled: false,
      occasions: [
        { key: 'eid', en: 'Eid', bn: 'ঈদ' },
        { key: 'winter', en: 'Winter', bn: 'শীত' },
        { key: 'puja', en: 'Puja', bn: 'পূজা' },
      ],
      cutoffOccasions: { eid: true },
      productsMax: 24,
      articlesMax: 3,
      offSeason: true,
    },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.seasonal.label',
    helpKey: 'marketing.seasonal.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 20,
    version: V246,
  }),
};
