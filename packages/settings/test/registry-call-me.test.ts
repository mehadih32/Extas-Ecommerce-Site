// CN-020 (3) (registry v99, SIM-F-046): "Call me" at checkout — at version 99, never owner data, labelled in both
// languages, off as shipped with the owner's thresholds (3 tries, 90 seconds), every number bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { callMeSchema, callMeSettings } from '../src/registry-call-me';

const spec = callMeSettings['checkout.callMe'];

describe('checkout.callMe setting (v99)', () => {
  it('is in the registry at version 99, store-level, labelled in English and Bengali with its call-back words', () => {
    expect(registry['checkout.callMe']).toBe(spec);
    expect(spec.version).toBe(99);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      for (const k of [spec.labelKey, spec.helpKey!, 'checkout.callMe.text.tries', 'checkout.callMe.text.idle', 'checkout.callMe.text.fields.phone', 'checkout.callMe.channel']) expect(lookup(messages[lang], k)).toBeTruthy();
      expect(lookup(messages[lang], 'checkout.callMe.text.tries')).toContain('{field}');
    }
  });

  it('ships off with 3 tries and 90 seconds; numbers stay in their bounds', () => {
    expect(spec.default).toEqual({ enabled: false, failedTries: 3, idleSeconds: 90, perPhonePerDay: 3 });
    expect(callMeSchema.safeParse({ ...spec.default, failedTries: 0 }).success).toBe(false);
    expect(callMeSchema.safeParse({ ...spec.default, idleSeconds: 5 }).success).toBe(false);
    expect(callMeSchema.safeParse({ ...spec.default, extra: 1 }).success).toBe(false);
  });
});
