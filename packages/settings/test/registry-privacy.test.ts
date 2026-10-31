// S18 · PR 382 (registry v79): erasure requests ship off; every key labelled in both languages, its default valid.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { privacySettings } from '../src/registry-privacy';

describe('privacy settings (v79)', () => {
  it('every key is in the registry at version 79, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(privacySettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(79);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('erasure requests ship off', () => {
    expect(privacySettings['privacy.erasureRequests'].default).toBe(false);
  });
});
