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

/**
 * PR 703 — urgent approvals on Telegram. Off until the owner turns them on; which kinds are asked, what a "big" COD order
 * is, how long Telegram's buttons stay live, and the wrong-PIN limits (an alarm from the 5th in a day, a lock at the 20th
 * until the owner unlocks it in the ERP with the PIN).
 */
export const telegramApprovalsSchema = z
  .object({
    enabled: z.boolean(),
    refund: z.boolean(),
    price: z.boolean(),
    /** PR 687 wiring: a cash entry waiting for an approver is asked on Telegram too. */
    cash: z.boolean().default(true),
    cod: z.boolean(),
    codOverMinor: z.number().int().min(0).max(100_000_000),
    waitMinutes: z.number().int().min(5).max(1440),
    pinAlarmPerDay: z.number().int().min(1).max(100),
    pinLockPerDay: z.number().int().min(1).max(1000),
    /** Set by the server at the lock, cleared by the owner (PIN) in the ERP; null = not locked. */
    lockedAt: z.string().nullable(),
  })
  .strict();
export type TelegramApprovalsSettings = z.output<typeof telegramApprovalsSchema>;

/**
 * PR 700 — the visitors view of Website → Analytics. Off until the owner turns it on: with `collect` off the shop's page
 * views carry nothing beyond their page type (as before); on, they also carry where the visitor came from (the referrer's
 * host and the UTM tags), the device size, the path without its query and the coarse region the CDN reports. Never an IP,
 * a name or a phone. `keepDays` is how long the daily roll-ups are kept; `liveWindowMinutes` is what "live now" means;
 * `topCount` is how long the top lists are.
 */
export const analyticsVisitorsSchema = z
  .object({
    collect: z.boolean(),
    keepDays: z.number().int().min(7).max(730),
    liveWindowMinutes: z.number().int().min(1).max(60),
    topCount: z.number().int().min(3).max(50),
  })
  .strict();
export type AnalyticsVisitorsSettings = z.output<typeof analyticsVisitorsSchema>;

/**
 * S28 · PR 701 (Website > Analytics > Behaviour): off until the owner turns it on. On, the shop counts where visitors click
 * (as a cell of a `grid` x `grid` map of the page, never what was clicked), how far they scroll (0/25/50/75/100%), and
 * which form fields they touch or leave empty (the field's name only, never what was typed). `keepDays` is how long the
 * daily counts stay.
 */
export const analyticsBehaviourSchema = z
  .object({
    collect: z.boolean(),
    keepDays: z.number().int().min(7).max(365),
    grid: z.number().int().min(5).max(40),
  })
  .strict();
export type AnalyticsBehaviourSettings = z.output<typeof analyticsBehaviourSchema>;

/** S28 · PR 705: Settings > Activity log: how many rows one page of the log shows. */
export const activityLogSchema = z.object({ pageSize: z.number().int().min(10).max(200) }).strict();
export type ActivityLogSettings = z.output<typeof activityLogSchema>;

/**
 * PR 664 and 687 wired to the staff limits (702) and the approvals (703). Owner decisions of 13 Nov 2026: price adjust and
 * cash in/out ship ON; the role limits ship empty, and an empty limit means EVERY adjustment or cash entry waits for one
 * approver (one is enough). `emptyLimitWaits` off makes an empty limit mean "no limit" as the staff controls screen says
 * for discounts. A cash limit is per role (the key of the role, in minor units; null = nothing set). The owner has no
 * limit. `askTelegram` also asks the waiting entry on Telegram when the owner turned the kind on there.
 */
export const approvalGatesSchema = z
  .object({
    priceAdjust: z.object({ emptyLimitWaits: z.boolean(), askTelegram: z.boolean() }).strict(),
    cash: z.object({ enabled: z.boolean(), emptyLimitWaits: z.boolean(), askTelegram: z.boolean(), limits: z.record(z.string().min(1).max(64), z.number().int().min(0).nullable()) }).strict(),
  })
  .strict();
export type ApprovalGatesSettings = z.output<typeof approvalGatesSchema>;

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
  'approvals.gates': setting({
    ...base,
    schema: approvalGatesSchema,
    default: { priceAdjust: { emptyLimitWaits: true, askTelegram: true }, cash: { enabled: true, emptyLimitWaits: true, askTelegram: true, limits: {} } },
    labelKey: 'approvals.gates.label',
    helpKey: 'approvals.gates.help',
    sortOrder: 727,
    version: 333,
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
  'telegram.approvals': setting({
    ...base,
    schema: telegramApprovalsSchema,
    default: { enabled: false, refund: true, price: true, cash: true, cod: true, codOverMinor: 800000, waitMinutes: 30, pinAlarmPerDay: 5, pinLockPerDay: 20, lockedAt: null }, // hardcode-ok: the setting's own shipped default, editable on the screen
    labelKey: 'telegram.approvals.label',
    helpKey: 'telegram.approvals.help',
    sortOrder: 723,
    version: 334,
  }),
  'analytics.visitors': setting({
    ...base,
    schema: analyticsVisitorsSchema,
    default: { collect: false, keepDays: 90, liveWindowMinutes: 5, topCount: 10 },
    labelKey: 'analytics.visitors.label',
    helpKey: 'analytics.visitors.help',
    sortOrder: 720,
    version: 700,
  }),
  'analytics.behaviour': setting({
    ...base,
    schema: analyticsBehaviourSchema,
    default: { collect: false, keepDays: 60, grid: 20 }, // hardcode-ok: the setting's own shipped default, editable on the screen
    labelKey: 'analytics.behaviour.label',
    helpKey: 'analytics.behaviour.help',
    sortOrder: 721,
    version: 701,
  }),
  'activity.log': setting({
    ...base,
    schema: activityLogSchema,
    default: { pageSize: 50 }, // hardcode-ok: the setting's own shipped default, editable in the settings list
    labelKey: 'activity.log.label',
    helpKey: 'activity.log.help',
    sortOrder: 722,
    version: 705,
  }),
};
