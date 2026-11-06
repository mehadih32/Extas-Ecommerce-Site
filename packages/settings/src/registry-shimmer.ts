// S02 · PR 598 (register "Site builder", the V2.1 items only; demo 89t-shimmer.js and 89u-bag-offers.js) — registry
// versions 246 and 247 (lane B, CN-036). The rest of PR 598 (menus, header, footer, categories, product page blocks,
// content pages, theme) stays paused per the register.
// - `shop.shimmer` (v246): each shimmer's speed and strength (the demo's 14 shimmers: the 12 of `shop.sweep` plus the
//   product page's words and size boxes, whose on/off stays in `pdp.sweep`). On/off and the master switch stay in
//   `shop.sweep` (PR 86). Speed: slow / as designed / fast, a factor of the designed pass time; strength: as designed /
//   medium / soft, a share of the designed brightness, never stronger (the designed level keeps the words under the
//   light at 4.5:1). The four factors are editable ("More options"). An empty `items` is the shop exactly as designed.
// - `bag.tiers.rules` (v247): the bag's "Take 2 │ Take 3 │ Take 4" box per Build-your-own-set rule: rules kept off the
//   box, and the owner's own words per tier. The tiers and their prices are the rules' own (Smart Rules, the owner's);
//   nothing here holds or changes a price.
import { z } from 'zod';
import { setting } from './define';
import { SHOP_SWEEPS } from './registry-motion';

/** Every shimmer of the shop (demo SHIM_ITEMS): the shop's sweeps, then the product page's words and size boxes. */
export const SHIMMERS = [...SHOP_SWEEPS, 'pdpWords', 'pdpPills'] as const;
export type Shimmer = (typeof SHIMMERS)[number];
export const SHIMMER_SPEEDS = ['slow', 'normal', 'fast'] as const;
export const SHIMMER_STRENGTHS = ['full', 'medium', 'soft'] as const;
export type ShimmerSpeed = (typeof SHIMMER_SPEEDS)[number];
export type ShimmerStrength = (typeof SHIMMER_STRENGTHS)[number];

const tuneSchema = z.object({ speed: z.enum(SHIMMER_SPEEDS), strength: z.enum(SHIMMER_STRENGTHS) }).strict();

export const shopShimmerSchema = z
  .object({
    /** A shimmer's speed and strength; a shimmer not listed is as designed. */
    items: z.object(Object.fromEntries(SHIMMERS.map((k) => [k, tuneSchema.optional()])) as Record<Shimmer, z.ZodOptional<typeof tuneSchema>>).strict(),
    /** "Slow": the designed pass time times this. */
    slow: z.number().min(1.05).max(3),
    /** "Fast": the designed pass time times this. */
    fast: z.number().min(0.3).max(0.95),
    /** "Medium": this share of the designed brightness. */
    medium: z.number().min(0.3).max(0.95),
    /** "Soft": this share of the designed brightness (never above medium). */
    soft: z.number().min(0.1).max(0.9),
  })
  .strict()
  .refine((v) => v.soft <= v.medium, { message: 'soft must not be brighter than medium' });

// hardcode-ok: the form's limits (a rule key's length, list lengths, a tier's words), not business numbers
const KEY_MAX = 80;
const WORDS_MAX = 60;
const LIST_MAX = 200;
const ruleKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/);
const words = z.object({ en: z.string().trim().max(WORDS_MAX), bn: z.string().trim().max(WORDS_MAX) }).strict();

export const bagTierRulesSchema = z
  .object({
    /** Build-your-own-set rules whose tiers are kept off the bag's box (the rule itself is untouched). */
    hidden: z.array(ruleKey).max(LIST_MAX),
    /** The owner's own words for one tier, by `<rule key>:<pieces>`; empty words = the shop's own ("Take {n}"). */
    labels: z.record(z.string().regex(new RegExp(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,${KEY_MAX - 1}}:[1-9][0-9]?$`)), words),
  })
  .strict()
  .refine((v) => new Set(v.hidden).size === v.hidden.length, { message: 'a rule is listed twice' })
  .refine((v) => Object.keys(v.labels).length <= LIST_MAX, { message: 'too many tier words' });

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: true } as const;

export const shimmerSettings = {
  'shop.shimmer': setting({
    ...json,
    version: 246,
    group: 'theme',
    schema: shopShimmerSchema,
    default: { items: {}, slow: 1.5, fast: 0.65, medium: 0.75, soft: 0.5 }, // hardcode-ok: the demo's SHIM_SPEED and SHIM_STRENGTH
    labelKey: 'shop.shimmer.label',
    helpKey: 'shop.shimmer.help',
    sortOrder: 141,
  }),
  'bag.tiers.rules': setting({
    ...json,
    version: 247,
    group: 'bag',
    isPublic: false,
    schema: bagTierRulesSchema,
    default: { hidden: [], labels: {} },
    labelKey: 'bag.tiers.rules.label',
    helpKey: 'bag.tiers.rules.help',
    sortOrder: 205,
  }),
};

export type ShopShimmerSettings = z.output<typeof shopShimmerSchema>;
export type BagTierRules = z.output<typeof bagTierRulesSchema>;
