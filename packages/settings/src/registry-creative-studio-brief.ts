// S25 · PR 490 (Blueprint C8.4, CN-018) — the creative brief's master switch.
//
// - `studio.creativeBrief.enabled`: off as shipped (CLAUDE.md rule 1 — every integration stays off until the
//   owner turns it on). While off, drafting a brief is refused (`OFF`); nothing is asked or proposed by itself.
import { z } from 'zod';
import { setting } from './define';

const V290 = 290;

export const studioCreativeBriefSchema = z
  .object({
    /** Off as shipped: drafting a brief is refused while this is false. */
    enabled: z.boolean(),
  })
  .strict();
export type StudioCreativeBriefSettings = z.output<typeof studioCreativeBriefSchema>;

export const studioCreativeBriefSettings = {
  'studio.creativeBrief': setting({
    scope: 'store',
    schema: studioCreativeBriefSchema,
    // hardcode-ok: off — the owner turns this on when he is ready to answer the brief's questions
    default: { enabled: false },
    valueType: 'JSON',
    group: 'marketing',
    labelKey: 'studio.creativeBrief.label',
    helpKey: 'studio.creativeBrief.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 26,
    version: V290,
  }),
};
