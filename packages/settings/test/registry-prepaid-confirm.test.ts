// S05 · PR 541 follow-up 320 (registry v266): the prepaid self-confirm switch — never owner data, labelled in English
// and Bengali, off as shipped, nothing but the one switch.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { prepaidConfirmSettings } from '../src/registry-prepaid-confirm';

describe('prepaid self-confirm setting (v266)', () => {
  it('orders.prepaid.selfConfirm is in the registry at version 266, labelled in both languages, off by default', () => {
    const spec = prepaidConfirmSettings['orders.prepaid.selfConfirm'];
    expect(registry['orders.prepaid.selfConfirm']).toBe(spec);
    expect(spec.version).toBe(266);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    expect(spec.default).toEqual({ enabled: false });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    expect(spec.schema.safeParse({ enabled: true, extra: 1 }).success).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
});
