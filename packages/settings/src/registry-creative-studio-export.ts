// S25 · PR 487 (Blueprint C8.5, CN-018) — the campaign creative export's master switch.
//
// - `studio.creativeExport.enabled`: off as shipped (CLAUDE.md rule 1 — every integration stays off until the
//   owner turns it on). While off, preparing an export is refused (`OFF`); nothing is gathered by itself.
import { z } from 'zod';
import { setting } from './define';

const V289 = 289;

export const studioCreativeExportSchema = z
  .object({
    /** Off as shipped: preparing an export is refused while this is false. */
    enabled: z.boolean(),
  })
  .strict();
export type StudioCreativeExportSettings = z.output<typeof studioCreativeExportSchema>;

export const studioCreativeExportSettings = {
  'studio.creativeExport': setting({
    scope: 'store',
    schema: studioCreativeExportSchema,
    // hardcode-ok: off — the owner turns this on when he is ready to prepare ad creative
    default: { enabled: false },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'studio.creativeExport.label',
    helpKey: 'studio.creativeExport.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 25,
    version: V289,
  }),
};
