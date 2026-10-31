// S19 · PR 395 (CN-030) — the backups' settings (registry version 75). Labels: messages/backups.<lang>.json. The admin's
// place is Settings → System → Backups (`/admin/settings/system/backups`). The server's backup scripts read them
// through the vault sync (packages/jobs/src/server-sync.ts → config/secrets/backup.env), so a change here reaches the
// next backup within VAULT_SYNC_EVERY_MIN minutes.
// - `backups.drive`: the name of the folder the one-click sign-in makes in the owner's Google Drive, and how many of
//   the newest backups that were checked whole Drive keeps (the Extas ERP's own decision, 30 Oct 2026: "Drive keeps 3";
//   0 = keep by age instead, `BACKUP_KEEP_DRIVE_DAYS` on the server).
// Nothing here moves money, changes a price or is the owner's data. Deleting an old copy in Drive moves it to the
// Drive's own bin; the newest checked copies always stay.
import { z } from 'zod';
import { setting } from './define';

const V = 75;

const base = { scope: 'installation', isOwnerData: false, isPublic: false, group: 'system', version: V } as const;

export const backupsDriveSchema = z
  .object({
    folderName: z.string().trim().min(1).max(100).regex(/^[^/\\]+$/, 'a folder name, no slashes'),
    keepCopies: z.int().min(0).max(60),
  })
  .strict();
export type BackupsDrive = z.output<typeof backupsDriveSchema>;

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
};
