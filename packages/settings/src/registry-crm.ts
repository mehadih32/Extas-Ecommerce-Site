// S14 · CRM (CN-031 lane A, After launch; PR 287 onwards). Registry versions 190–199 (lane A's reserved numbers). Labels:
// messages/customers.<lang>.json (the "customers" group; the admin's place is the Customers section,
// docs/BACKEND-ARCHITECTURE.md §5.5). Every feature here is off as shipped. Nothing here moves money, changes a price,
// COD or a charge, or blocks anyone.
//
// PR 287 (`customers.segments`, v190): saved segments from real behaviour (CUS-03, CUS-03a) — whether the Segments page
// works at all (off: the page says so and nothing is counted), how many saved segments a store may keep, how many
// conditions one segment may join with "and", and how many matching customers the builder shows beside the live count.
import { z } from 'zod';
import { setting } from './define';

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'customers' } as const;

/** PR 287 — saved segments. */
export const segmentSettingsSchema = z
  .object({
    enabled: z.boolean(),
    maxSegments: z.int().min(1).max(500),
    maxConditions: z.int().min(1).max(50),
    previewShown: z.int().min(0).max(50),
  })
  .strict();

export const crmSettings = {
  'customers.segments': setting({
    ...base,
    version: 190,
    schema: segmentSettingsSchema,
    default: { enabled: false, maxSegments: 50, maxConditions: 10, previewShown: 8 }, // hardcode-ok: registry default (off; list sizes)
    valueType: 'JSON',
    labelKey: 'customers.segments.label',
    helpKey: 'customers.segments.help',
    sortOrder: 200,
  }),
};
