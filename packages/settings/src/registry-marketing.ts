// S13 · CN-031 lane B — Marketing: landing pages and what follows them (registry versions 168–179, lane B's reserved
// run). Everything is off as it ships.
//   v168 · PR 254 `marketing.landing` — ad landing pages at /l/<slug> (Blueprint MKT-05, demo 70-landing.js): one product,
//          one offer, an order box on the page; the pages are built and published in Marketing › Landing pages, but the
//          shop serves none of them until this switch is on. Never indexed by search engines (noindex, follow).
import { z } from 'zod';
import { setting } from './define';

const V254 = 168;

export const landingSettingsSchema = z
  .object({
    /** The master switch: off, no landing page is served to customers (the builder still works). */
    on: z.boolean(),
  })
  .strict();
export type LandingSettings = z.output<typeof landingSettingsSchema>;

export const marketingSettings = {
  'marketing.landing': setting({
    scope: 'store',
    schema: landingSettingsSchema,
    default: { on: false },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'marketing.landing.label',
    helpKey: 'marketing.landing.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 10,
    version: V254,
  }),
};
