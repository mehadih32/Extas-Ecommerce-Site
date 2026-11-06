// S13 · PR 277 (registry v212): the campaign blast's own switch — at version 212, off as it ships (and "every customer"
// off: a saved segment is required), never owner data, labelled in both languages, nothing else in it.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { blastSettings, blastSettingsSchema } from '../src/registry-blast';

describe('customers.blast (v212)', () => {
  it('is in the registry at version 212, store-level, off, labelled in English and Bengali', () => {
    const spec = blastSettings['customers.blast'];
    expect(registry['customers.blast']).toBe(spec);
    expect(spec.version).toBe(212);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false, allowEveryone: false });
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('refuses extra keys and non-booleans', () => {
    expect(blastSettingsSchema.safeParse({ enabled: true, allowEveryone: true }).success).toBe(true);
    expect(blastSettingsSchema.safeParse({ enabled: true, allowEveryone: false, batchSize: 10 }).success).toBe(false);
    expect(blastSettingsSchema.safeParse({ enabled: 'yes', allowEveryone: false }).success).toBe(false);
  });
});
