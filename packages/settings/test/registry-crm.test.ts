// S14 · CRM (registry v190–199, CN-031 lane A): every key in the customers group at its own version, never owner data,
// labelled in both languages, its default valid and off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { CRM_MESSAGE_STEP, crmSettings, JOURNEY_KIND_KEYS, journeySettingsSchema, journeysSettingsSchema, segmentSettingsSchema } from '../src/registry-crm';

describe('CRM settings (v190–199)', () => {
  it('every key is in the registry in the customers group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(crmSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBeGreaterThanOrEqual(190);
      expect(spec.version, key).toBeLessThanOrEqual(199);
      expect(spec.group, key).toBe('customers');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 287: segments are off as shipped (v190), 50 kept, 10 conditions, 8 shown', () => {
    const s = crmSettings['customers.segments'];
    expect(s.version).toBe(190);
    expect(s.default).toEqual({ enabled: false, maxSegments: 50, maxConditions: 10, previewShown: 8 });
    expect(segmentSettingsSchema.safeParse({ ...s.default, maxConditions: 0 }).success).toBe(false);
    expect(segmentSettingsSchema.safeParse({ ...s.default, auto: true }).success).toBe(false);
  });

  it('PR 288: the journey tab is off as shipped (v191), every kind listed once, 50 a page', () => {
    const s = crmSettings['customers.journey'];
    expect(s.version).toBe(191);
    expect(s.default).toEqual({ enabled: false, kinds: [...JOURNEY_KIND_KEYS], perPage: 50 });
    expect(journeySettingsSchema.safeParse({ ...s.default, kinds: ['order', 'order'] }).success).toBe(false);
    expect(journeySettingsSchema.safeParse({ ...s.default, kinds: ['gps'] }).success).toBe(false);
  });

  it('PR 289: automations are off as shipped (v192), with limits and a stop line in both languages', () => {
    const s = crmSettings['customers.journeys'];
    expect(s.version).toBe(192);
    expect(s.default.enabled).toBe(false);
    expect(s.default.stopLine.bn).toBeTruthy();
    expect(s.default.stopLine.en).toBeTruthy();
    expect(journeysSettingsSchema.safeParse({ ...s.default, perCustomerPerWeek: 0 }).success).toBe(false);
    expect(journeysSettingsSchema.safeParse({ ...s.default, stopLine: { bn: 'x'.repeat(121), en: '' } }).success).toBe(false);
    expect(CRM_MESSAGE_STEP).toBe('crmJourney');
  });
});
