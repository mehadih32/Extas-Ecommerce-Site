// S28 · PR 700-707 (admin prototype v5, wave 5b) — the settings of the Wave 5b screens, every one off or empty as it
// ships and every number editable (CLAUDE.md: a number is a backend setting, never code). Each key carries the version
// of its own PR (700-707). Labels: messages/s28-w5b.<lang>.json. The owner's written OK (13 Nov 2026) covers the
// staff discount limits and Start fresh; both still ship off.
import { z } from 'zod';
import { setting } from './define';

const base = { scope: 'store', valueType: 'JSON', group: 'admin', isOwnerData: false, isPublic: false } as const;

/** PR 702 — one role's limits: the biggest discount it may give without the owner (empty = no limit) and whether it sees a customer's phone and address in full. */
export const staffRoleLimitSchema = z
  .object({
    maxDiscountMinor: z.number().int().min(0).nullable(),
    maxDiscountPct: z.number().min(0).max(100).nullable(),
    hideContact: z.boolean(),
  })
  .strict();
export type StaffRoleLimit = z.output<typeof staffRoleLimitSchema>;

export const staffControlsSchema = z
  .object({
    /** Keyed by the role's key (`packer`, `support` …); a role not listed has no limit and sees everything it could. */
    limits: z.record(z.string().min(1).max(64), staffRoleLimitSchema),
    /** The end-of-day cash and bKash sheet each desk staff member hands over. */
    handover: z.object({ enabled: z.boolean(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).strict(),
  })
  .strict();
export type StaffControls = z.output<typeof staffControlsSchema>;

/** PR 706 — Start fresh: off until the owner switches it on; the backup must be this fresh (minutes) when it runs. */
export const startFreshSchema = z
  .object({
    enabled: z.boolean(),
    backupMaxAgeMinutes: z.number().int().min(5).max(1440),
  })
  .strict();
export type StartFreshSettings = z.output<typeof startFreshSchema>;

/**
 * PR 704 — the bulk and corporate orders screen. Off until the owner turns it on; every number is the owner's:
 * the advance percent a new quote starts with, how many days a quote stands, how many batches at most, and the days
 * between a quote's planned batches.
 */
export const bulkOrdersSchema = z
  .object({
    enabled: z.boolean(),
    defaultAdvancePct: z.number().int().min(0).max(100),
    quoteValidDays: z.number().int().min(1).max(365),
    maxBatches: z.number().int().min(1).max(12),
    batchGapDays: z.number().int().min(1).max(60),
    firstBatchAfterDays: z.number().int().min(0).max(120),
    refPrefix: z.string().max(8),
  })
  .strict();
export type BulkOrdersSettings = z.output<typeof bulkOrdersSchema>;

export const s28W5bSettings = {
  'staff.controls': setting({
    ...base,
    schema: staffControlsSchema,
    default: { limits: {}, handover: { enabled: false, time: '21:30' } },
    labelKey: 'staff.controls.label',
    helpKey: 'staff.controls.help',
    sortOrder: 720,
    version: 702,
  }),
  'startFresh.settings': setting({
    ...base,
    schema: startFreshSchema,
    default: { enabled: false, backupMaxAgeMinutes: 60 },
    labelKey: 'startFresh.settings.label',
    helpKey: 'startFresh.settings.help',
    sortOrder: 726,
    version: 706,
  }),
  'bulk.orders': setting({
    ...base,
    schema: bulkOrdersSchema,
    default: { enabled: false, defaultAdvancePct: 50, quoteValidDays: 15, maxBatches: 4, batchGapDays: 4, firstBatchAfterDays: 3, refPrefix: 'QT-' },
    labelKey: 'bulk.orders.label',
    helpKey: 'bulk.orders.help',
    sortOrder: 724,
    version: 704,
  }),
};
