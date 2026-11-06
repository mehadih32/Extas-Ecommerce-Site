// S13 · PR 279 (registry v214): the SEO outreach pipeline — at version 214, off as it ships, never owner data, labelled
// in both languages; no pitch words as shipped; the follow-up gap stays a whole number of days.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { outreachSettings, outreachSettingsSchema } from '../src/registry-outreach';

describe('marketing.outreach (v214)', () => {
  it('is in the registry at version 214, store-level, off, without words, labelled in English and Bengali', () => {
    const spec = outreachSettings['marketing.outreach'];
    expect(registry['marketing.outreach']).toBe(spec);
    expect(spec.version).toBe(214);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default.enabled).toBe(false);
    expect(spec.default.pitchSubject).toBeNull();
    expect(spec.default.pitchBody).toBeNull();
    expect(outreachSettingsSchema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('refuses a broken follow-up gap, overlong words, a missing language and extra keys', () => {
    const d = outreachSettings['marketing.outreach'].default;
    for (const b of [{ followUpDays: -1 }, { followUpDays: 1.5 }, { followUpDays: 91 }, { pitchSubject: { en: 'x'.repeat(201), bn: 'x' } }, { pitchBody: { en: 'Hello' } }, { pitchBody: { en: 'Hello', bn: ' ' } }, { sendFromShop: true }])
      expect(outreachSettingsSchema.safeParse({ ...d, ...b }).success).toBe(false);
    expect(outreachSettingsSchema.safeParse({ ...d, followUpDays: 0, pitchBody: { en: 'Hello {site}', bn: 'হ্যালো {site}' } }).success).toBe(true);
  });
});
