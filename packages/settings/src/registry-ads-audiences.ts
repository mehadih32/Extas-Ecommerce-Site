// S13 · PR 263 (Blueprint C6.2 points 3–5) — sending audiences to the ad platforms (registry version 170, lane B's
// reserved run). `ads.audiences`: the sending switch (off as it ships: no list leaves the shop), the lookalike's
// countries and size per platform (Meta a share of 1–10 %, Google and TikTok narrow / balanced / broad; empty = not
// set, and no lookalike is made), and the fewest people a list must hold before it is sent to each platform (0 = no
// floor; each platform has its own minimum and refuses a smaller list). Nothing here is filled in for the owner, and no
// budget, bid or campaign is touched by any of it (rule 6).
import { z } from 'zod';
import { setting } from './define';

const V263 = 170;
/** A typing guard on the floor, not a business number. */
export const AUDIENCE_FLOOR_MAX = 1_000_000; // hardcode-ok: a typing guard
export const LOOKALIKE_SIZE_CHOICES = ['', 'narrow', 'balanced', 'broad'] as const;

export const adsAudiencesSchema = z
  .object({
    /** The sending switch: off, "Send now" refuses and nothing is sent. */
    push: z.boolean(),
    /** Two-letter country codes the lookalikes are drawn from, comma separated (empty: no lookalike is made). */
    countries: z
      .string()
      .trim()
      .max(60)
      .regex(/^([A-Za-z]{2}(\s*,\s*[A-Za-z]{2})*)?$/, { message: 'two-letter codes, comma separated' }),
    /** Meta: the lookalike's share of the country, 1–10 (0: not set). */
    metaPercent: z.number().int().min(0).max(10),
    googleSize: z.enum(LOOKALIKE_SIZE_CHOICES),
    tiktokSize: z.enum(LOOKALIKE_SIZE_CHOICES),
    /** The fewest people before a list is sent to the platform (0: no floor). */
    minMeta: z.number().int().min(0).max(AUDIENCE_FLOOR_MAX),
    minGoogle: z.number().int().min(0).max(AUDIENCE_FLOOR_MAX),
    minTiktok: z.number().int().min(0).max(AUDIENCE_FLOOR_MAX),
  })
  .strict();
export type AdsAudiencesSettings = z.output<typeof adsAudiencesSchema>;

/** The lookalike countries as codes (upper case, each once). */
export const lookalikeCountries = (s: Pick<AdsAudiencesSettings, 'countries'>): string[] => [
  ...new Set(
    s.countries
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  ),
];

export const adsAudiencesSettings = {
  'ads.audiences': setting({
    scope: 'store',
    schema: adsAudiencesSchema,
    default: {
      push: false,
      countries: '',
      metaPercent: 0, // hardcode-ok: 0 = not set (no lookalike on Meta until the owner picks a share)
      googleSize: '',
      tiktokSize: '',
      minMeta: 0,
      minGoogle: 0,
      minTiktok: 0,
    },
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.audiences.label',
    helpKey: 'ads.audiences.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 20,
    version: V263,
  }),
};
