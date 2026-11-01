// S14 · CRM (registry v190–209, CN-031 lane A): every key in the customers group at its own version, never owner data,
// labelled in both languages, its default valid and off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { aiWriterSettingsSchema, CRM_CAMPAIGN_STEP, customerExportSettingsSchema, pointsSettingsSchema, sendAdviceSettingsSchema, CRM_MESSAGE_STEP, crmSettings, JOURNEY_KIND_KEYS, journeySettingsSchema, journeysSettingsSchema, segmentSettingsSchema, winbackSettingsSchema } from '../src/registry-crm';

describe('CRM settings (v190–209)', () => {
  it('every key is in the registry in the customers group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(crmSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBeGreaterThanOrEqual(190);
      expect(spec.version, key).toBeLessThanOrEqual(209);
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

  it('PR 293: the AI campaign writer is off as shipped (v194), 3 versions, the owner\'s voice empty until he types it', () => {
    const s = crmSettings['customers.aiWriter'];
    expect(s.version).toBe(194);
    expect(s.default.enabled).toBe(false);
    expect(s.default.versions).toBe(3);
    expect(s.default.greeting).toEqual({ bn: '', en: '' });
    expect(aiWriterSettingsSchema.safeParse({ ...s.default, versions: 4 }).success).toBe(false);
    expect(aiWriterSettingsSchema.safeParse({ ...s.default, style: { bn: 'x'.repeat(201), en: '' } }).success).toBe(false);
  });

  it('PR 294: who-and-when advice is off as shipped (v195), 90 days, 30 orders, a 2-hour window, 3 segments', () => {
    const s = crmSettings['customers.sendAdvice'];
    expect(s.version).toBe(195);
    expect(s.default).toEqual({ enabled: false, lookbackDays: 90, minOrders: 30, windowHours: 2, maxSegments: 3 });
    expect(sendAdviceSettingsSchema.safeParse({ ...s.default, windowHours: 0 }).success).toBe(false);
  });

  it('PR 296: rewards and points are off as shipped (v197), every rule number 0 until the owner types his own', () => {
    const s = crmSettings['customers.points'];
    expect(s.version).toBe(197);
    expect(s.default).toEqual({ enabled: false, pointsPer100: 0, orderPoints: 0, holdDays: 7, lookbackDays: 30, redeemPoints: 0, redeemMinor: 0, batchSize: 200 });
    expect(pointsSettingsSchema.safeParse({ ...s.default, pointsPer100: -1 }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...s.default, lookbackDays: 0 }).success).toBe(false);
    expect(pointsSettingsSchema.safeParse({ ...s.default, tiers: [] }).success).toBe(false);
  });

  it('PR 299: the customer export is off as shipped (v198), 5000 people a file at most', () => {
    const s = crmSettings['customers.export'];
    expect(s.version).toBe(198);
    expect(s.default).toEqual({ enabled: false, maxRows: 5_000 });
    expect(customerExportSettingsSchema.safeParse({ ...s.default, maxRows: 0 }).success).toBe(false);
    expect(customerExportSettingsSchema.safeParse({ ...s.default, columns: [] }).success).toBe(false);
  });

  it('PR 300: win-back campaigns are off as shipped (v199), one offer by phone a week, 30 days between win-backs', () => {
    const s = crmSettings['customers.winback'];
    expect(s.version).toBe(199);
    expect(s.default).toMatchObject({ enabled: false, perCustomerPerWeek: 1, gapDays: 30, batchSize: 200, resultDays: 14, defaultLapsedDays: 90 });
    expect(s.default.stopLine.bn).toBeTruthy();
    expect(s.default.stopLine.en).toBeTruthy();
    expect(winbackSettingsSchema.safeParse({ ...s.default, gapDays: 0 }).success).toBe(false);
    expect(winbackSettingsSchema.safeParse({ ...s.default, defaultLapsedDays: 3 }).success).toBe(false);
    expect(winbackSettingsSchema.safeParse({ ...s.default, discount: 10 }).success).toBe(false);
    expect(CRM_CAMPAIGN_STEP).toBe('crmCampaign');
  });
});
