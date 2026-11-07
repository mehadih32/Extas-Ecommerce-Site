// S14 · PR 286 follow-up 477 (registry v267): folding repeated opens on "Who looked at this customer" — never owner data,
// labelled in English and Bengali, off as shipped, the minutes bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { looksFoldSettings } from '../src/registry-looks-fold';

describe('looks fold setting (v267)', () => {
  it('customers.looksFold is in the registry at version 267, labelled in both languages, off by default', () => {
    const spec = looksFoldSettings['customers.looksFold'];
    expect(registry['customers.looksFold']).toBe(spec);
    expect(spec.version).toBe(267);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default.enabled).toBe(false);
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    expect(spec.schema.safeParse({ enabled: true, minutes: 0 }).success).toBe(false);
    expect(spec.schema.safeParse({ enabled: true, minutes: 121 }).success).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
});
