// S18 · PR 380 (registry v78): the admin address list ships off and empty; a list that is on needs an address; entries
// are addresses or ranges only; every key labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adminAccessSettings, adminIpAllowlistSchema } from '../src/registry-admin-access';

describe('admin access settings (v78)', () => {
  it('every key is in the registry at version 78, installation-wide, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(adminAccessSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(78);
      expect(s.scope, key).toBe('installation');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the address list ships off and empty; on needs an address; only addresses and ranges', () => {
    expect(adminAccessSettings['security.adminIpAllowlist'].default).toEqual({ enabled: false, entries: [] });
    expect(adminIpAllowlistSchema.safeParse({ enabled: true, entries: [] }).success).toBe(false);
    expect(adminIpAllowlistSchema.safeParse({ enabled: true, entries: ['203.0.113.0/24', '2001:db8::/48', '198.51.100.7'] }).success).toBe(true);
    for (const bad of ['example.com', '203.0.113.0/33', '300.1.1.1', '*', '']) {
      expect(adminIpAllowlistSchema.safeParse({ enabled: false, entries: [bad] }).success, bad).toBe(false);
    }
  });
});
