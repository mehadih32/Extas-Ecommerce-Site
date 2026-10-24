// S06 · PR 542 (registry v54): the advance request from the order — in the registry at version 54, labelled in both
// languages, the auto option off by default (CN-018), a pay service from the list only, a template key only.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { ADVANCE_PROVIDERS, advanceRequestSchema, advanceRequestSettings } from '../src/registry-advance-request';

describe('advance request settings (v54)', () => {
  it('in the registry at version 54, labelled in English and Bengali, its default valid with the auto option off', () => {
    const spec = advanceRequestSettings['orders.advanceRequest'];
    expect(registry['orders.advanceRequest']).toBe(spec);
    expect(spec.version).toBe(54);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default.auto).toBe(false);
    expect(ADVANCE_PROVIDERS).toContain(spec.default.provider);
  });

  it('refuses a pay service not on the list, a bad template key and a missing way', () => {
    const d = advanceRequestSettings['orders.advanceRequest'].default;
    expect(advanceRequestSchema.safeParse({ ...d, provider: 'paypal' }).success).toBe(false);
    expect(advanceRequestSchema.safeParse({ ...d, template: 'Advance Request' }).success).toBe(false);
    expect(advanceRequestSchema.safeParse({ ...d, channels: { SMS: true, CALL: true } }).success).toBe(false);
  });
});
