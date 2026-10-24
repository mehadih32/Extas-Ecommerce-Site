// S14 · PR 284–286 (registry v60): every customers key at version 60 in the customers group, never owner data,
// labelled in both languages, its default valid; the merge rules only suggest (a person merges), and the VIP view
// waits for the owner's own figure (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { customerSettings, MERGE_SIGNALS, mergeRulesSchema, phoneMaskSchema } from '../src/registry-customers';

describe('customers settings (v60)', () => {
  it('every key is in the registry at version 60 in the customers group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(customerSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(60);
      expect(spec.group, key).toBe('customers');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], 'groups.customers'), lang).toBeTruthy();
      }
    }
  });

  it('PR 284: the merge rules suggest by every match, a page at a time; a signal once; nothing merges by itself', () => {
    const m = customerSettings['customers.merge'].default;
    expect(m).toEqual({ suggest: true, signals: [...MERGE_SIGNALS], perPage: 20, noteRequired: false });
    expect(mergeRulesSchema.safeParse({ ...m, signals: ['email', 'email'] }).success).toBe(false);
    expect(mergeRulesSchema.safeParse({ ...m, signals: ['phone'] }).success).toBe(false);
    expect(mergeRulesSchema.safeParse({ ...m, auto: true }).success).toBe(false);
  });

  it('PR 284: a masked number keeps three digits at each end', () => {
    expect(customerSettings['customers.phoneMask'].default).toEqual({ first: 3, last: 3 });
    expect(phoneMaskSchema.safeParse({ first: 6, last: 3 }).success).toBe(false);
  });
});
