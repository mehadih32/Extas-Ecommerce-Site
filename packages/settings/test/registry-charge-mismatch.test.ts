// S08 · PR 564 (registry v95): the charge mismatch log's switch — at version 95, never owner data, labelled in both
// languages, off as shipped, and only a plain on/off (no amount, no correction).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { chargeMismatchSchema, chargeMismatchSettings } from '../src/registry-charge-mismatch';

const spec = chargeMismatchSettings['delivery.chargeMismatch'];

describe('charge mismatch log setting (v95)', () => {
  it('is in the registry at version 95, store-level, labelled in English and Bengali', () => {
    expect(registry['delivery.chargeMismatch']).toBe(spec);
    expect(spec.version).toBe(95);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off and takes only the switch', () => {
    expect(spec.default).toEqual({ enabled: false });
    expect(chargeMismatchSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(chargeMismatchSchema.safeParse({ enabled: true, correct: true }).success).toBe(false);
  });
});
