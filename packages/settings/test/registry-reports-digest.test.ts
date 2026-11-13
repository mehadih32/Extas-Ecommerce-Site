// S15 · PR 341 (registry v289): weekly/monthly digests to Telegram and e-mail — both channels off, the owner's
// e-mail empty, as it ships.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { reportsDigestLangSchema, reportsDigestSettings } from '../src/registry-reports-digest';

describe('reports.digest settings (v289)', () => {
  it('is in the registry at version 289, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(reportsDigestSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(289);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships quiet: both channels off, the language Bengali, and the owner e-mail empty', () => {
    expect(reportsDigestSettings['reports.digest.telegramOn'].default).toBe(false);
    expect(reportsDigestSettings['reports.digest.emailOn'].default).toBe(false);
    expect(reportsDigestSettings['reports.digest.lang'].default).toBe('bn');
    expect(reportsDigestSettings['reports.digest.ownerEmail'].default).toBeNull();
  });

  it("the owner's e-mail is declared owner data (CLAUDE.md rule 4), the switches and language are not", () => {
    expect(reportsDigestSettings['reports.digest.ownerEmail'].isOwnerData).toBe(true);
    expect(reportsDigestSettings['reports.digest.telegramOn'].isOwnerData).toBe(false);
    expect(reportsDigestSettings['reports.digest.emailOn'].isOwnerData).toBe(false);
    expect(reportsDigestSettings['reports.digest.lang'].isOwnerData).toBe(false);
  });

  it('the owner e-mail setting takes a real address or null, never an empty string or junk', () => {
    const s = reportsDigestSettings['reports.digest.ownerEmail'].schema;
    expect(s.safeParse('owner@example.com').success).toBe(true);
    expect(s.safeParse(null).success).toBe(true);
    expect(s.safeParse('').success).toBe(false);
    expect(s.safeParse('not an address').success).toBe(false);
  });

  it('the digest language is bn or en only', () => {
    expect(reportsDigestLangSchema.safeParse('bn').success).toBe(true);
    expect(reportsDigestLangSchema.safeParse('en').success).toBe(true);
    expect(reportsDigestLangSchema.safeParse('fr').success).toBe(false);
  });
});
