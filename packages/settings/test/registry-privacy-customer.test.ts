// S18 · PR 623 (registry v221): the customer's own privacy request ships off; labelled in both languages; its words
// in both languages; a kind list that is empty, repeated or unknown is refused.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { privacyCustomerSettings, PRIVACY_REQUEST_WORDS } from '../src/registry-privacy-customer';

const s = privacyCustomerSettings['privacy.customerRequests'];

describe('privacy.customerRequests (v221)', () => {
  it('is in the registry at version 221, off, its default valid and labelled in English and Bengali', () => {
    expect(registry['privacy.customerRequests']).toBe(s);
    expect(s.version).toBe(221);
    expect(s.default.enabled).toBe(false);
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!)).toBeTruthy();
      for (const w of PRIVACY_REQUEST_WORDS) expect(s.default.words[w][lang].length, `${w} ${lang}`).toBeGreaterThan(0);
    }
  });

  it('refuses no kind, a kind twice, an unknown kind, and a copy kept 0 or over 30 days', () => {
    const d = s.default;
    for (const bad of [{ ...d, kinds: [] }, { ...d, kinds: ['COPY', 'COPY'] }, { ...d, kinds: ['DELETE'] }, { ...d, copyDays: 0 }, { ...d, copyDays: 31 }]) expect(s.schema.safeParse(bad).success).toBe(false);
    expect(s.schema.safeParse({ ...d, kinds: ['ERASURE'] }).success).toBe(true);
  });
});
