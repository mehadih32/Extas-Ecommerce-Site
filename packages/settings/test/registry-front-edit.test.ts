// S02 · PR 79 (registry v242): the switch for editing the shop's words on the shop page — at version 242, off, store
// level, not public, never owner data, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { frontEditSchema, frontEditSettings } from '../src/registry-front-edit';

describe('language.frontEdit (v242)', () => {
  it('is in the registry at version 242, off, store-level, labelled in English and Bengali', () => {
    const spec = frontEditSettings['language.frontEdit'];
    expect(registry['language.frontEdit']).toBe(spec);
    expect(spec.version).toBe(242);
    expect(spec.default).toEqual({ enabled: false });
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('takes only the switch', () => {
    expect(frontEditSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(frontEditSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
    expect(frontEditSchema.safeParse({ enabled: true, extra: 1 }).success).toBe(false);
  });
});
