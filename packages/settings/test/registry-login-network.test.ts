// Follow-up 609 (PR 15, 380; registry v271): the sign-in pause per network is one installation setting, off as shipped,
// its e-mail ceiling editable, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { loginNetworkSettings } from '../src/registry-login-network';

describe('sign-in pause per network (v271)', () => {
  it('is in the registry at version 271, off, installation-wide, labelled in English and Bengali', () => {
    const s = loginNetworkSettings['security.loginLockoutByNetwork'];
    expect(registry['security.loginLockoutByNetwork']).toBe(s);
    expect([s.version, s.default, s.scope, s.isOwnerData]).toEqual([271, { enabled: false, emailCeiling: 50 }, 'installation', false]);
    expect(s.schema.safeParse({ enabled: true, emailCeiling: 5 }).success).toBe(false);
    expect(s.schema.safeParse({ enabled: true, emailCeiling: 6 }).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
    }
  });
});
