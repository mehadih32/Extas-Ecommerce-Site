// S13 · PR 548 (register "Market and competitor intelligence"; demo MKT-07 "Market & competitors") — registry
// version 291.
//   `ads.intel` — Marketing › Market & competitors (`/admin/marketing/intel`): the owner's own list of followed
//   shops' public pages (`Competitor`, reused from the S15 teardown-report schema), each read through the page
//   reader connection (PR 33) for its own products and prices, lined up against ours by name. Proposals only — a
//   price never changes here; it changes in the ERP. `maxLinks` and `matchScore` have no card field yet (an honest
//   gap: the shared settings card has no multi-field layout for this page's needs beyond the one switch the demo
//   shows); `on` (the page's "Change alerts") is the one visible control.
import { z } from 'zod';
import { setting } from './define';

const V291 = 291;

export const adsIntelSchema = z
  .object({
    /** Highlight a price or range change on the page since the link was last read. No delivery channel is built yet. */
    on: z.boolean(),
    /** Followed links at once. */
    maxLinks: z.int().min(1).max(50),
    /** A link is read again this many hours after its last read, on "Check all" or the daily run. */
    refreshHours: z.int().min(1).max(168),
    /** How close two product names must be (Jaccard word overlap, per cent) to count as the same product. */
    matchScore: z.int().min(10).max(100),
  })
  .strict();
export type AdsIntelSettings = z.output<typeof adsIntelSchema>;

/** The shipped defaults (off); the owner changes `on` ("Change alerts") on the page's card. */
export const ADS_INTEL_DEFAULT: AdsIntelSettings = { on: false, maxLinks: 10, refreshHours: 24, matchScore: 55 }; // hardcode-ok: the setting's shipped default

export const adsIntelSettings = {
  'ads.intel': setting({
    scope: 'store',
    schema: adsIntelSchema,
    default: ADS_INTEL_DEFAULT,
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.intel.label',
    helpKey: 'ads.intel.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 96,
    version: V291,
  }),
};
