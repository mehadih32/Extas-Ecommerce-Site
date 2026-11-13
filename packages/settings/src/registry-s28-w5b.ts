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
};
