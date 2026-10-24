// S08 · PR 184, 525 (registry v58): what the courier tells us after booking — every key at version 58, never owner data,
// labelled in both languages, its default valid and off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { accountTrackCourierSchema, courierSyncSettings, deliveryTruthCheckSchema } from '../src/registry-courier-sync';

describe('courier sync settings (v58)', () => {
  it('every key is in the registry at version 58, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(courierSyncSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(58);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 184: the courier news on his order page is off until the owner turns it on', () => {
    expect(courierSyncSettings['account.track.courier'].default).toEqual({ enabled: false, exceptions: true });
    expect(courierSyncSettings['account.track.courier'].group).toBe('accounts');
    expect(accountTrackCourierSchema.safeParse({ enabled: true }).success).toBe(false);
  });

  it('PR 525: the true-delivery check is off; on, it holds the order by default and looks 30 days back', () => {
    expect(courierSyncSettings['delivery.truthCheck'].default).toEqual({ enabled: false, holdOrder: true, lookbackDays: 30 });
    expect(courierSyncSettings['delivery.truthCheck'].group).toBe('delivery');
    expect(deliveryTruthCheckSchema.safeParse({ enabled: true, holdOrder: true, lookbackDays: 0 }).success).toBe(false);
  });
});
