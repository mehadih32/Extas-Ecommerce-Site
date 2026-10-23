// S02 · the house motion — PR 86 (the light-sweep system and its per-element switches, Blueprint D1.5, demo
// 89t-shimmer.js SHIM_ITEMS) and PR 87 (the celebration overlay on order placement, D1.5 / §41.18). Registry version
// 31. Labels: messages/storefront.<lang>.json (`shop.sweep`, `thanks.celebrate`). No admin screen (CN-019): the keys
// live with their sections and are set through the settings store until the owner's admin architecture is approved.
//
// The sweep defaults reproduce the approved demo (every sweep on, the Add to Bag sweep off, R3). Speed and strength
// per sweep are PR 598's (the shimmer control); the product page's own sweeps keep their switches in `pdp.sweep`.
// The celebration is off (Blueprint's defaults table: "Celebration overlay — Off").
import { z } from 'zod';
import { setting } from './define';
import { daySchema, listIdSchema } from './registry-storefront';
import { localizedTextSchema } from './schemas';

const V = 31;

/** The sweeps of the shop outside the product page's words and size boxes, in the demo's order (SHIM_ITEMS). */
export const SHOP_SWEEPS = [
  'checkout',
  'continueShopping',
  'freeLabel',
  'addToBag',
  'orderNow',
  'buttons',
  'logo',
  'checkoutHelp',
  'checkoutNeed',
  'accountOffer',
  'announce',
  'footerPay',
] as const;
export type ShopSweep = (typeof SHOP_SWEEPS)[number];

export const shopSweepSchema = z
  .object({
    /** Every sweep of the shop at once, the product page's own included. Off: nothing sweeps anywhere. */
    on: z.boolean(),
    /** One switch per sweep. A button with its own switch keeps its sweep when "buttons" (all other green buttons) is off. */
    items: z.object(Object.fromEntries(SHOP_SWEEPS.map((k) => [k, z.boolean()])) as Record<ShopSweep, z.ZodBoolean>).strict(),
  })
  .strict();

/** The particles of the celebration: balloons rising, or light streaking up. */
export const CELEBRATE_STYLES = ['balloons', 'streaks'] as const;

export const thanksCelebrateSchema = z
  .object({
    on: z.boolean(),
    /** The occasion's name. Once a customer has seen it, he never sees this one again; a new name starts again. */
    campaign: listIdSchema,
    style: z.enum(CELEBRATE_STYLES),
    /** The words in the middle (and, for reduced motion, the only thing shown). Empty: the dictionary's "Thank you!". */
    text: localizedTextSchema(40).nullable(),
    /** How long it runs; never more than 2.5 seconds (Blueprint D1.5). */
    durationMs: z.int().min(600).max(2500),
    /** Once per customer per occasion (this phone or computer). Off: once per order. */
    once: z.boolean(),
    /** The first and last day of the occasion, in the store's time zone. Empty: no limit. */
    from: daySchema.nullable(),
    until: daySchema.nullable(),
    /** `?celebrate=preview` on a thank-you page plays it even while off, for the owner to see it first. */
    preview: z.boolean(),
  })
  .strict()
  .refine((v) => !v.from || !v.until || v.from <= v.until, { message: 'the first day must not be after the last' });

const json = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: true, version: V } as const;

export const motionSettings = {
  'shop.sweep': setting({
    ...json,
    group: 'theme',
    schema: shopSweepSchema,
    default: { on: true, items: { ...(Object.fromEntries(SHOP_SWEEPS.map((k) => [k, true])) as Record<ShopSweep, boolean>), addToBag: false } },
    labelKey: 'shop.sweep.label',
    helpKey: 'shop.sweep.help',
    sortOrder: 140,
  }),
  'thanks.celebrate': setting({
    ...json,
    group: 'checkout',
    schema: thanksCelebrateSchema,
    default: { on: false, campaign: 'launch', style: 'balloons', text: null, durationMs: 2200, once: true, from: null, until: null, preview: true }, // hardcode-ok: the Blueprint's 2.5 s ceiling, a little under
    labelKey: 'thanks.celebrate.label',
    helpKey: 'thanks.celebrate.help',
    sortOrder: 940,
  }),
};

export type ShopSweepSettings = z.output<typeof shopSweepSchema>;
export type ThanksCelebrateSettings = z.output<typeof thanksCelebrateSchema>;
