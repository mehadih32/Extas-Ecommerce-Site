// S22 · PR 426 (CN-031 lane A, registry v72): the Support channel keys at version 72, store-scoped, labelled in both
// languages, their defaults valid, nothing owner data. Meta's 24-hour reply window as it ships; the site chat off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportChannelSettings } from '../src/registry-support-channels';

describe('PR 426 · Support channel settings (v72)', () => {
  it('every key is in the registry at version 72, per store, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(supportChannelSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(72);
      expect(s.scope, key).toBe('store');
      expect(s.group, key).toBe('support');
      expect(s.isOwnerData, key).toBe(false);
      expect(s.isPublic, key).toBe(false);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it("Meta's window is 24 hours as it ships; the site chat is off; every number is bounded", () => {
    expect(registry['support.channels'].default).toEqual({ replyWindowHours: 24, webhookMaxBodyKb: 256 });
    expect(registry['support.liveChat'].default).toEqual({ enabled: false, pollSeconds: 5, maxChars: 1000, perMinute: 6, cookieDays: 30 });
    const c = registry['support.channels'].schema;
    expect(c.safeParse({ replyWindowHours: 0, webhookMaxBodyKb: 256 }).success).toBe(false);
    expect(c.safeParse({ replyWindowHours: 24, webhookMaxBodyKb: 4096 }).success).toBe(false);
    const l = registry['support.liveChat'].schema;
    const d = registry['support.liveChat'].default;
    expect(l.safeParse({ ...d, pollSeconds: 1 }).success).toBe(false);
    expect(l.safeParse({ ...d, perMinute: 0 }).success).toBe(false);
    expect(l.safeParse({ ...d, extra: true }).success).toBe(false);
  });
});
