// D10 · PR 1004, 1005, 1006 (admin parity, final round) — the three small settings the prototype v5's System screens show and the real
// ones did not have:
// - `backups.schedule` (Backups & restore › Schedule): "Back up every 6 hours / 12 hours (twice a day) / day" and "Keep on the server: newest 3–7".
//   The server's backup clock reads it with the older `backups.plan`; as shipped it is one a day and the newest 4 on the server.
// - `health.checks` (Site health › Alerts & checks): the Telegram alert when something breaks (on) and how often the full health and audit
//   check runs (every night).
// - `updates.auto` (Updates & versions › How updates arrive): install updates by themselves, only after every check passes (on, as the
//   server already does since CN-006; off holds updates until someone installs them).
// None of them is the owner's data and none moves money.
import { z } from 'zod';
import { setting } from './define';

const V1004 = 1004;

export const backupsScheduleSchema = z.object({ everyHours: z.union([z.literal(6), z.literal(12), z.literal(24)]), keepOnServer: z.int().min(3).max(7) }).strict();
export type BackupsSchedule = z.output<typeof backupsScheduleSchema>;
export const BACKUP_EVERY_HOURS = [6, 12, 24] as const;
export const BACKUP_KEEP_ON_SERVER = [3, 4, 5, 6, 7] as const;

export const healthChecksSchema = z.object({ telegramAlerts: z.boolean(), auditEvery: z.enum(['hourly', 'daily', 'weekly']) }).strict();
export type HealthChecks = z.output<typeof healthChecksSchema>;
export const HEALTH_AUDIT_EVERY = ['hourly', 'daily', 'weekly'] as const;

export const updatesAutoSchema = z.object({ auto: z.boolean() }).strict();
export type UpdatesAuto = z.output<typeof updatesAutoSchema>;

const base = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'system', version: V1004 } as const;

export const d10Settings = {
  'backups.schedule': setting({
    ...base,
    schema: backupsScheduleSchema,
    default: { everyHours: 24, keepOnServer: 4 },
    valueType: 'JSON',
    labelKey: 'backups.schedule.label',
    helpKey: 'backups.schedule.help',
    sortOrder: 960,
  }),
  'health.checks': setting({
    ...base,
    schema: healthChecksSchema,
    default: { telegramAlerts: true, auditEvery: 'daily' },
    valueType: 'JSON',
    labelKey: 'health.checks.label',
    helpKey: 'health.checks.help',
    sortOrder: 961,
  }),
  'updates.auto': setting({
    ...base,
    schema: updatesAutoSchema,
    default: { auto: true },
    valueType: 'JSON',
    labelKey: 'updates.auto.label',
    helpKey: 'updates.auto.help',
    sortOrder: 962,
  }),
} as const;
