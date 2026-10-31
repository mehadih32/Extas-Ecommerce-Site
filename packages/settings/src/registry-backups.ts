// S19 · PR 395 (CN-030) — the backups' settings (registry version 75). Labels: messages/backups.<lang>.json. The admin's
// place is Settings → System → Backups (`/admin/settings/system/backups`). The server's backup scripts read them
// through the vault sync (packages/jobs/src/server-sync.ts → config/secrets/backup.env), so a change here reaches the
// next backup within VAULT_SYNC_EVERY_MIN minutes.
// - `backups.drive`: the name of the folder the one-click sign-in makes in the owner's Google Drive, and how many of
//   the newest backups that were checked whole Drive keeps (the Extas ERP's own decision, 30 Oct 2026: "Drive keeps 3";
//   0 = keep by age instead, `BACKUP_KEEP_DRIVE_DAYS` on the server).
// S19 · PR 507 (version 76) — the backup settings and the restore drill, all from the admin, none on the server:
// - `backups.plan`: when the nightly backup runs, how many days each place keeps (the server's disk, Blob, Drive when
//   `keepCopies` is 0), how long archived WAL stays on the disk, and the free share the disk keeps before a backup
//   (the old copies go first); the defaults are the server's own (infra/config/server.conf).
// - `backups.drill`: the monthly restore drill — on which day and time, and which copies besides the server's own it
//   restores into a throw-away database (Blob, Drive); never the live one.
// - `backups.alerts`: Telegram when a backup or a drill fails (on) and when it went well (off).
// Nothing here moves money, changes a price or is the owner's data. Deleting an old copy in Drive moves it to the
// Drive's own bin; the newest checked copies always stay.
import { z } from 'zod';
import { setting } from './define';

const V = 75;
const V507 = 76;

const base = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'system', version: V } as const;

/** `HH:MM`, 24 h, the server's time zone. */
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'a time like 02:30' });

export const backupsDriveSchema = z
  .object({
    folderName: z.string().trim().min(1).max(100).regex(/^[^/\\]+$/, 'a folder name, no slashes'),
    keepCopies: z.int().min(0).max(60),
  })
  .strict();
export type BackupsDrive = z.output<typeof backupsDriveSchema>;

export const backupsPlanSchema = z
  .object({
    dailyTime: clock,
    keepLocalDays: z.int().min(1).max(90),
    keepBlobDays: z.int().min(1).max(3650),
    keepDriveDays: z.int().min(1).max(3650),
    keepLocalWalDays: z.int().min(1).max(30),
    minFreePct: z.int().min(5).max(60),
  })
  .strict();
export type BackupsPlan = z.output<typeof backupsPlanSchema>;

export const backupsDrillSchema = z
  .object({
    enabled: z.boolean(),
    dayOfMonth: z.int().min(1).max(28),
    time: clock,
    blob: z.boolean(),
    drive: z.boolean(),
  })
  .strict();
export type BackupsDrill = z.output<typeof backupsDrillSchema>;

export const backupsAlertsSchema = z.object({ telegramOnFail: z.boolean(), telegramOnSuccess: z.boolean() }).strict();
export type BackupsAlerts = z.output<typeof backupsAlertsSchema>;

export const backupsSettings = {
  'backups.drive': setting({
    ...base,
    schema: backupsDriveSchema,
    default: { folderName: 'Extas E-commerce Backups', keepCopies: 3 },
    valueType: 'JSON',
    labelKey: 'backups.drive.label',
    helpKey: 'backups.drive.help',
    sortOrder: 950,
  }),
  'backups.plan': setting({
    ...base,
    version: V507,
    schema: backupsPlanSchema,
    default: { dailyTime: '02:30', keepLocalDays: 7, keepBlobDays: 35, keepDriveDays: 30, keepLocalWalDays: 2, minFreePct: 20 },
    valueType: 'JSON',
    labelKey: 'backups.plan.label',
    helpKey: 'backups.plan.help',
    sortOrder: 951,
  }),
  'backups.drill': setting({
    ...base,
    version: V507,
    schema: backupsDrillSchema,
    default: { enabled: true, dayOfMonth: 1, time: '03:30', blob: true, drive: true },
    valueType: 'JSON',
    labelKey: 'backups.drill.label',
    helpKey: 'backups.drill.help',
    sortOrder: 952,
  }),
  'backups.alerts': setting({
    ...base,
    version: V507,
    schema: backupsAlertsSchema,
    default: { telegramOnFail: true, telegramOnSuccess: false },
    valueType: 'JSON',
    labelKey: 'backups.alerts.label',
    helpKey: 'backups.alerts.help',
    sortOrder: 953,
  }),
};
