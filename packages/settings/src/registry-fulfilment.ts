// S08 · the packing step of Orders › Packing & print (PR 182; Blueprint B1.3, CN-014c, SIM-F-010, follow-up 434).
// Registry version 59. Labels: messages/fulfilment.<lang>.json (the "delivery" group, beside the sticker, the handover
// sheet and the picking list; the admin's place is Orders › Packing & print › Pack, ORD-04 of
// docs/BACKEND-ARCHITECTURE.md §5.3). Every new behaviour here is off until the owner turns it on (CN-018); only the
// piece check keeps the demo's scan, because "Mark packed requires an SKU scan match" is the packing step itself.
//
// PR 182:
// - `fulfilment.packing.check`: how each piece is checked before "Mark packed": scanned (its SKU must match a line of
//   the order), the SKU typed when the scanner is off (`allowTyped`), or a tick per line without a scanner (`tick`).
// - `fulfilment.packing.photo` (CN-014c): the packing proof photo, off by default. `required`: "Mark packed" and the
//   courier booking wait for `minPhotos` photos (SIM-F-010), unless the owner waives it for one order with a reason;
//   `reminder`: the screen asks for it, nothing waits. `keepDays`: each photo is kept this many days, then archived.
// - `fulfilment.packing.weight` (follow-up 434): the parcel's scale reading against its pieces' own weights, off by
//   default. A reading further off than both `gapPercent` and `gapGrams` is flagged and "Mark packed" asks the packer
//   to weigh again or confirm; `requireReading` makes a reading needed before "Mark packed".
// - `fulfilment.packing.queue`: how long handed-over orders stay on the "Handed over" step (`doneDays`), and how many
//   orders one step lists.
import { z } from 'zod';
import { setting } from './define';

const V = 59;

const base = { scope: 'store', isOwnerData: false, isPublic: false, group: 'delivery', version: V, valueType: 'JSON' } as const;

/** How the pieces are checked at the packing table. */
export const PACKING_CHECK_MODES = ['scan', 'tick'] as const;

/** PR 182 — the piece check before "Mark packed". */
export const packingCheckSchema = z.object({ mode: z.enum(PACKING_CHECK_MODES), allowTyped: z.boolean() }).strict();

/** PR 182 (CN-014c, SIM-F-010) — the packing proof photo. */
export const packingPhotoSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['required', 'reminder']),
    minPhotos: z.int().min(1).max(10),
    keepDays: z.int().min(1).max(3650),
  })
  .strict();

/** PR 182 (follow-up 434) — the parcel's weight at packing. */
export const packingWeightSchema = z
  .object({
    enabled: z.boolean(),
    gapPercent: z.int().min(1).max(100),
    gapGrams: z.int().min(1).max(100_000),
    requireReading: z.boolean(),
  })
  .strict();

/** PR 182 — the packing screen's lists. */
export const packingQueueSchema = z.object({ doneDays: z.int().min(0).max(30), listMax: z.int().min(10).max(500) }).strict();

export const fulfilmentSettings = {
  'fulfilment.packing.check': setting({
    ...base,
    schema: packingCheckSchema,
    default: { mode: 'scan', allowTyped: true },
    labelKey: 'fulfilment.packing.check.label',
    helpKey: 'fulfilment.packing.check.help',
    sortOrder: 920,
  }),
  'fulfilment.packing.photo': setting({
    ...base,
    schema: packingPhotoSchema,
    default: { enabled: false, mode: 'required', minPhotos: 1, keepDays: 30 },
    labelKey: 'fulfilment.packing.photo.label',
    helpKey: 'fulfilment.packing.photo.help',
    sortOrder: 921,
  }),
  'fulfilment.packing.weight': setting({
    ...base,
    schema: packingWeightSchema,
    default: { enabled: false, gapPercent: 15, gapGrams: 100, requireReading: false }, // hardcode-ok: the setting's own default (off); the owner changes the gap here
    labelKey: 'fulfilment.packing.weight.label',
    helpKey: 'fulfilment.packing.weight.help',
    sortOrder: 922,
  }),
  'fulfilment.packing.queue': setting({
    ...base,
    schema: packingQueueSchema,
    default: { doneDays: 1, listMax: 200 },
    labelKey: 'fulfilment.packing.queue.label',
    helpKey: 'fulfilment.packing.queue.help',
    sortOrder: 923,
  }),
};

export type PackingCheckSettings = z.output<typeof packingCheckSchema>;
export type PackingPhotoSettings = z.output<typeof packingPhotoSchema>;
export type PackingWeightSettings = z.output<typeof packingWeightSchema>;
