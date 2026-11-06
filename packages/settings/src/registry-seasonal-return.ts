// S12 · PR 530 (register "Seasonal page lifecycle — archived and live are states, never deletion. A seasonal page
// returns on its own when the occasion comes round"; Blueprint answer 15) — registry version 251, lane C.
//   `marketing.seasonalReturn` — the yearly return of the permanent seasonal pages (PR 246). Off as it ships: a page
//   goes live only when a person presses "Make live". On: a page that was live once, is taken down (not put away), has
//   "comes back each year" ticked and has nothing missing shows live again on the shop from `leadDays` days before its
//   occasion's dates until `afterDays` days after them, then rests again by itself. The occasions' dates are the
//   owner's own (`dates`: from and to, shop days; "every year" repeats the same month and day, for a season like
//   winter; Eid and Puja move, so each year's dates are typed in). Empty as it ships: with no dates nothing returns.
import { z } from 'zod';
import { setting } from './define';
import { OCCASION_KEY_RE } from './registry-seasonal';

const V530 = 251;

/** A shop day, `YYYY-MM-DD`. */
export const SEASON_DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const seasonDateSchema = z
  .object({
    /** The occasion (a key of `marketing.seasonal.occasions`). */
    occasion: z.string().trim().min(1).max(30).regex(OCCASION_KEY_RE),
    /** Its first day. */
    from: z.string().regex(SEASON_DAY_RE),
    /** Its last day (on or after `from`; for "every year", a later month and day may fall in the next year). */
    to: z.string().regex(SEASON_DAY_RE),
    /** The same month and day every year (a season), instead of this year's dates only (Eid, Puja). */
    yearly: z.boolean(),
  })
  .strict()
  .refine((d) => d.yearly || d.to >= d.from, { message: 'to before from', path: ['to'] });
export type SeasonDate = z.output<typeof seasonDateSchema>;

export const seasonalReturnSchema = z
  .object({
    /** Ticked pages come back live by themselves for their occasion's dates. */
    on: z.boolean(),
    /** How many days before the occasion's first day the page comes back. */
    leadDays: z.int().min(0).max(90),
    /** How many days after the occasion's last day it stays before resting again. */
    afterDays: z.int().min(0).max(30),
    /** The occasions' dates, the owner's own. */
    dates: z.array(seasonDateSchema).max(60),
  })
  .strict();
export type SeasonalReturnSettings = z.output<typeof seasonalReturnSchema>;

export const SEASONAL_RETURN_DEFAULT: SeasonalReturnSettings = { on: false, leadDays: 14, afterDays: 2, dates: [] };

export const seasonalReturnSettings = {
  'marketing.seasonalReturn': setting({
    scope: 'store',
    schema: seasonalReturnSchema,
    default: SEASONAL_RETURN_DEFAULT,
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.seasonalReturn.label',
    helpKey: 'marketing.seasonalReturn.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 21,
    version: V530,
  }),
};
