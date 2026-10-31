// S19 · PR 395, 507 — the backups' settings: in the registry, labelled in both languages, defaults valid, never owner
// data and never money; the Drive folder is the CN-030 name and keeps the newest 3 checked copies.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { backupsDriveSchema, backupsSettings } from '../src/registry-backups';

describe('backups settings (v75–76)', () => {
  it('every key is in the registry, labelled in English and Bengali, its default valid, not owner data', () => {
    for (const [key, s] of Object.entries(backupsSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect([75, 76], key).toContain(s.version);
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
});
