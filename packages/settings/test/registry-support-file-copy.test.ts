// Follow-up 505 (PR 425, 426; registry v273): copying a customer's channel file is one store setting, off as shipped,
// every number editable, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportFileCopySettings } from '../src/registry-support-file-copy';

describe('copying a customer`s channel file (v273)', () => {
  it('is in the registry at version 273, off, per store, B4.8 keeping times, labelled in English and Bengali', () => {
    const s = supportFileCopySettings['support.fileCopy'];
    expect(registry['support.fileCopy']).toBe(s);
    expect([s.version, s.scope, s.isOwnerData, s.group]).toEqual([273, 'store', false, 'support']);
    expect(s.default).toEqual({ enabled: false, maxMb: 25, perRun: 20, photoDays: 730, videoDays: 90, otherDays: 730, giveUpHours: 48 });
    expect(s.schema.safeParse({ ...s.default, maxMb: 0 }).success).toBe(false);
    expect(s.schema.safeParse({ ...s.default, videoDays: 3_651 }).success).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });
});
