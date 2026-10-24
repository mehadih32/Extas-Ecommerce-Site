// S05 · PR 150 (registry v44): the whole order history's one key — never owner data, labelled in English and Bengali,
// its default valid; both parts on (it only shows what the order stores), and nothing but the two switches.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { accountSettings } from '../src/registry-accounts';

describe('order history settings (v44)', () => {
  it('account.history is in the registry at version 44, labelled in both languages, on by default', () => {
    const spec = accountSettings['account.history'];
    expect(registry['account.history']).toBe(spec);
    expect(spec.version).toBe(44);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ filters: true, timeline: true });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    expect(spec.schema.safeParse({ filters: true, timeline: true, extra: 1 }).success).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
});
