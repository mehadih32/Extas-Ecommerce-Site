// S08 · PR 182 (registry v59): the packing step's settings — in the registry at version 59, in the Delivery group, never
// owner data, labelled in both languages, each default valid; every new behaviour off until the owner turns it on.
import { describe, expect, it } from 'vitest';
import { registryVersion } from '../src/define';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { fulfilmentSettings, packingCheckSchema, packingPhotoSchema, packingQueueSchema, packingWeightSchema } from '../src/registry-fulfilment';

describe('packing settings (v59)', () => {
  it('every key is in the registry at version 59 in the Delivery group, labelled in English and Bengali, its default valid', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(59);
    for (const [key, spec] of Object.entries(fulfilmentSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(59);
      expect(spec.group, key).toBe('delivery');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the piece check scans with typing allowed; tick is the no-scanner way; nothing else is accepted', () => {
    expect(fulfilmentSettings['fulfilment.packing.check'].default).toEqual({ mode: 'scan', allowTyped: true });
    expect(packingCheckSchema.safeParse({ mode: 'tick', allowTyped: false }).success).toBe(true);
    expect(packingCheckSchema.safeParse({ mode: 'off', allowTyped: true }).success).toBe(false);
  });

  it('CN-014c: the packing photo is off by default, required when on, one photo kept 30 days', () => {
    const d = fulfilmentSettings['fulfilment.packing.photo'].default;
    expect(d).toEqual({ enabled: false, mode: 'required', minPhotos: 1, keepDays: 30 });
    expect(packingPhotoSchema.safeParse({ ...d, minPhotos: 0 }).success).toBe(false);
    expect(packingPhotoSchema.safeParse({ ...d, keepDays: 0 }).success).toBe(false);
    expect(packingPhotoSchema.safeParse({ ...d, mode: 'sometimes' }).success).toBe(false);
  });

  it('follow-up 434: the weight check is off by default; a gap needs both the percent and the grams', () => {
    const d = fulfilmentSettings['fulfilment.packing.weight'].default;
    expect(d).toEqual({ enabled: false, gapPercent: 15, gapGrams: 100, requireReading: false });
    expect(packingWeightSchema.safeParse({ ...d, gapPercent: 0 }).success).toBe(false);
    expect(packingQueueSchema.safeParse({ doneDays: 31, listMax: 200 }).success).toBe(false);
  });
});
