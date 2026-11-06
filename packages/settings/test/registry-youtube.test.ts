// S13 · PR 278 (registry v213): the YouTube module — at version 213, off as it ships, never owner data, labelled in
// both languages; the link's tags are safe to put in an address.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { youtubeSettings, youtubeSettingsSchema } from '../src/registry-youtube';

describe('marketing.youtube (v213)', () => {
  it('is in the registry at version 213, store-level, off, labelled in English and Bengali', () => {
    const spec = youtubeSettings['marketing.youtube'];
    expect(registry['marketing.youtube']).toBe(spec);
    expect(spec.version).toBe(213);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default.enabled).toBe(false);
    expect(youtubeSettingsSchema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('refuses tags that do not fit in a link, empty source or medium, and extra keys', () => {
    const d = youtubeSettings['marketing.youtube'].default;
    for (const b of [{ utmSource: '' }, { utmSource: 'you tube' }, { utmMedium: 'a&b' }, { campaignPrefix: 'yt/' }, { campaignPrefix: 'x'.repeat(21) }, { budget: 10 }])
      expect(youtubeSettingsSchema.safeParse({ ...d, ...b }).success).toBe(false);
    expect(youtubeSettingsSchema.safeParse({ ...d, campaignPrefix: '' }).success).toBe(true);
  });
});
