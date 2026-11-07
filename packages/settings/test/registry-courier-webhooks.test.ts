// S08 · PR 176/177 follow-up 372 (registry v269): the couriers' own status calls — never owner data, labelled in English
// and Bengali, off as shipped, the size an editable whole number of KB.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { courierWebhookSettings } from '../src/registry-courier-webhooks';

describe('courier webhooks setting (v269)', () => {
  it('delivery.courier.webhooks is in the registry at version 269, labelled in both languages, off by default', () => {
    const spec = courierWebhookSettings['delivery.courier.webhooks'];
    expect(registry['delivery.courier.webhooks']).toBe(spec);
    expect(spec.version).toBe(269);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toMatchObject({ enabled: false });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });

  it('the size is a whole number of KB from 1 to 1024', () => {
    const s = courierWebhookSettings['delivery.courier.webhooks'].schema;
    expect(s.safeParse({ enabled: true, maxBodyKb: 1 }).success).toBe(true);
    expect(s.safeParse({ enabled: true, maxBodyKb: 0 }).success).toBe(false);
    expect(s.safeParse({ enabled: true, maxBodyKb: 2.5 }).success).toBe(false);
    expect(s.safeParse({ enabled: true, maxBodyKb: 2048 }).success).toBe(false);
  });
});
