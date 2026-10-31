// S18 · PR 378 (registry v73): the page protection policy and the per-address request limits — every key at version 73,
// labelled in both languages, its default valid and safe (report only, observe only: nothing is blocked as it ships);
// an outside source can never smuggle a keyword or a second directive into the policy.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { cspExtraSourcesSchema, cspSourceSchema, ratePerMinuteSchema, webSecuritySettings } from '../src/registry-web-security';

describe('web security settings (v73)', () => {
  it('every key is in the registry at version 73, installation-wide, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(webSecuritySettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(73);
      expect(s.scope, key).toBe('installation');
      expect(s.group, key).toBe('security');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships safe: the policy only reports, the limits only observe, no outside source', () => {
    expect(webSecuritySettings['security.csp.mode'].default).toBe('report');
    expect(webSecuritySettings['security.rateLimit.mode'].default).toBe('observe');
    expect(Object.values(webSecuritySettings['security.csp.extraSources'].default).flat()).toEqual([]);
  });

  it('an outside source is an https origin (a *. wildcard and a path allowed), never a keyword or a second directive', () => {
    for (const ok of ['https://cdn.example.com', 'https://*.example.com', 'https://cdn.example.com:8443/js/']) {
      expect(cspSourceSchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of [
      "'unsafe-eval'",
      '*',
      'http://cdn.example.com',
      'https://cdn.example.com; script-src *',
      'https://cdn.example.com x',
      "https://cdn.example.com'",
      'data:',
      'https://',
      'https://*',
    ]) {
      expect(cspSourceSchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(cspExtraSourcesSchema.safeParse({ script: [] }).success).toBe(false); // every kind named
  });

  it('every request kind has a limit of at least one a minute', () => {
    const d = webSecuritySettings['security.rateLimit.perMinute'].default;
    expect(Object.keys(d).sort()).toEqual(['checkout', 'report', 'shopWrite', 'signIn', 'webhook']);
    expect(ratePerMinuteSchema.safeParse({ ...d, signIn: 0 }).success).toBe(false);
  });
});
