// S02 · the house motion — PR 87 (the celebration overlay on order placement, Blueprint D1.5 / §41.18). Registry
// version 31. Labels: messages/storefront.<lang>.json (`thanks.celebrate`). No admin screen (CN-019): the keys live
// with their sections and are set through the settings store until the owner's admin architecture is approved.
//
// The celebration is off (Blueprint's defaults table: "Celebration overlay — Off").
import { z } from 'zod';
import { setting } from './define';
import { daySchema, listIdSchema } from './registry-storefront';
import { localizedTextSchema } from './schemas';

const V = 31;

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

export type ThanksCelebrateSettings = z.output<typeof thanksCelebrateSchema>;
