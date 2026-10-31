// S19 · PR 395, 507 — the backups' settings: in the registry, labelled in both languages, defaults valid, never owner
// data and never money; the Drive folder is the CN-030 name and keeps the newest 3 checked copies.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { backupsBlobSchema, backupsDriveSchema, backupsDrillSchema, backupsPlanSchema, backupsSettings, goLiveChecksSchema, goLiveSignoffSchema } from '../src/registry-backups';

describe('backups settings (v75–77)', () => {
  it('every key is in the registry, labelled in English and Bengali, its default valid, not owner data', () => {
    for (const [key, s] of Object.entries(backupsSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect([75, 76, 77], key).toContain(s.version);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('Drive: the folder of CN-030, the newest 3 checked copies kept; a path is not a folder name', () => {
    expect(backupsSettings['backups.drive'].default).toEqual({ folderName: 'Extas E-commerce Backups', keepCopies: 3 });
    expect(backupsDriveSchema.safeParse({ folderName: 'a/b', keepCopies: 3 }).success).toBe(false);
    expect(backupsDriveSchema.safeParse({ folderName: 'X', keepCopies: -1 }).success).toBe(false);
    expect(backupsDriveSchema.safeParse({ folderName: 'X', keepCopies: 0 }).success).toBe(true);
  });

  it('PR 507: the plan, the drill and the alerts are the server\'s own defaults; a bad time or day is refused', () => {
    expect(backupsSettings['backups.plan'].default).toEqual({ dailyTime: '02:30', keepLocalDays: 7, keepBlobDays: 35, keepDriveDays: 30, keepLocalWalDays: 2, minFreePct: 20 });
    expect(backupsSettings['backups.drill'].default).toEqual({ enabled: true, dayOfMonth: 1, time: '03:30', blob: true, drive: true });
    expect(backupsSettings['backups.alerts'].default).toEqual({ telegramOnFail: true, telegramOnSuccess: false });
    expect(backupsPlanSchema.safeParse({ ...backupsSettings['backups.plan'].default, dailyTime: '24:00' }).success).toBe(false);
    expect(backupsPlanSchema.safeParse({ ...backupsSettings['backups.plan'].default, keepLocalDays: 0 }).success).toBe(false);
    expect(backupsDrillSchema.safeParse({ ...backupsSettings['backups.drill'].default, dayOfMonth: 31 }).success).toBe(false);
  });

  it('PR 393: the go-live checks have their hours and minutes; nothing is confirmed by default; a sign-off is checked', () => {
    expect(backupsSettings['golive.checks'].default).toEqual({ smokeHours: 36, healthMinutes: 30, certDays: 30 });
    // PR 397: the origin certificate's days to spare; a value saved before it gets the default
    expect(goLiveChecksSchema.parse({ smokeHours: 36, healthMinutes: 30 })).toEqual({ smokeHours: 36, healthMinutes: 30, certDays: 30 });
    expect(goLiveChecksSchema.safeParse({ smokeHours: 36, healthMinutes: 30, certDays: 0 }).success).toBe(false);
    expect(backupsSettings['golive.signoff'].default).toEqual({});
    expect(goLiveSignoffSchema.safeParse({ qaGate: { at: '2026-10-31T10:00:00.000Z', by: 'u1' } }).success).toBe(true);
    expect(goLiveSignoffSchema.safeParse({ qaGate: { at: 'yesterday', by: 'u1' } }).success).toBe(false);
    expect(goLiveSignoffSchema.safeParse({ 'a b': { at: '2026-10-31T10:00:00.000Z', by: null } }).success).toBe(false);
  });

  it('PR 391: the Blob container is the server\'s own default and an Azure name; the gate has its hours and days', () => {
    expect(backupsSettings['backups.blob'].default).toEqual({ container: 'extas-backups' });
    expect(backupsBlobSchema.safeParse({ container: 'Extas_Backups' }).success).toBe(false);
    expect(backupsBlobSchema.safeParse({ container: 'a--b' }).success).toBe(false);
    expect(backupsSettings['backups.gate'].default).toEqual({ freshHours: 36, drillDays: 35 });
  });
});
