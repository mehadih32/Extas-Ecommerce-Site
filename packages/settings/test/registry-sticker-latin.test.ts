// SIM-F-048 · PR 179 follow-up (registry v96): the sticker's Latin address line switch — at version 96, never owner
// data, labelled in both languages, off as shipped, and only a plain on/off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { stickerLatinSchema, stickerLatinSettings } from '../src/registry-sticker-latin';

const spec = stickerLatinSettings['delivery.sticker.latin'];

describe('sticker Latin line setting (v96)', () => {
  it('is in the registry at version 96, store-level, labelled in English and Bengali', () => {
    expect(registry['delivery.sticker.latin']).toBe(spec);
    expect(spec.version).toBe(96);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off and takes only the switch', () => {
    expect(spec.default).toEqual({ enabled: false });
    expect(stickerLatinSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(stickerLatinSchema.safeParse({ enabled: true, extra: true }).success).toBe(false);
  });
});
