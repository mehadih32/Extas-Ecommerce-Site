// S08 · PR 180 follow-up 437 (registry v275): the courier's pick-up against a handed-over sheet — never owner data,
// labelled in English and Bengali, off as shipped, both hours editable whole numbers.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { handoverCheckSettings } from '../src/registry-handover-check';

describe('handover check setting (v275)', () => {
  it('fulfilment.handover.reconcile is in the registry at version 275, labelled in both languages, off by default', () => {
    const spec = handoverCheckSettings['fulfilment.handover.reconcile'];
    expect(registry['fulfilment.handover.reconcile']).toBe(spec);
    expect(spec.version).toBe(275);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toMatchObject({ enabled: false });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });

  it('both hours are whole numbers from 1 to 168', () => {
    const s = handoverCheckSettings['fulfilment.handover.reconcile'].schema;
    expect(s.safeParse({ enabled: true, afterHours: 1, windowHours: 168 }).success).toBe(true);
    expect(s.safeParse({ enabled: true, afterHours: 0, windowHours: 24 }).success).toBe(false);
    expect(s.safeParse({ enabled: true, afterHours: 12, windowHours: 169 }).success).toBe(false);
    expect(s.safeParse({ enabled: true, afterHours: 1.5, windowHours: 24 }).success).toBe(false);
  });
});
