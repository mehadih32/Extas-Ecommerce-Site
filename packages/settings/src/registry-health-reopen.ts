// Follow-up 596 (PR 423) — the re-open rule for a fixed customer problem that comes back. Registry version 270. Labels:
// messages/health.<lang>.json (`health.problems.reopen`).
//
// - `health.problems.reopen`: off as shipped. A problem marked Fixed that is reported again is only flagged ("came
//   back") on Reports › Site health › Customer problems. With the rule on, once it has `records` new reports that
//   arrived more than `graceMinutes` after it was marked fixed (a page opened before the fix may still report), it goes
//   back to New by itself, its fix note kept in the audit log (health.problem.reopen). Nothing else changes in the shop.
import { z } from 'zod';
import { setting } from './define';

const V = 270;

export const healthReopenSchema = z
  .object({
    enabled: z.boolean(),
    records: z.int().min(1).max(1_000),
    graceMinutes: z.int().min(0).max(1_440),
  })
  .strict();
export type HealthReopenSettings = z.output<typeof healthReopenSchema>;

export const healthReopenSettings = {
  'health.problems.reopen': setting({
    scope: 'store',
    schema: healthReopenSchema,
    default: { enabled: false, records: 3, graceMinutes: 60 },
    valueType: 'JSON',
    group: 'system',
    labelKey: 'health.problems.reopen.label',
    helpKey: 'health.problems.reopen.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 952,
    version: V,
  }),
} as const;
