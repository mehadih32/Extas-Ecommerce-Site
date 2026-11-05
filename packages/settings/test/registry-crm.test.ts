// S14 · CRM (registry v190–209, CN-031 lane A): every key in the customers group at its own version, never owner data,
// labelled in both languages, its default valid and off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { aiWriterSettingsSchema, approvalHistorySettingsSchema, BIRTHDAY_NO_YEAR, birthdayDate, birthdayParts, birthdaySettingsSchema, CRM_CAMPAIGN_STEP, customerReportSettingsSchema, customerExportSettingsSchema, pointsSettingsSchema, sendAdviceSettingsSchema, CRM_MESSAGE_STEP, crmSettings, JOURNEY_KIND_KEYS, journeySettingsSchema, journeysSettingsSchema, segmentSettingsSchema, winbackSettingsSchema } from '../src/registry-crm';

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

  it('PR 301: the birthday field is off as shipped (v200), the year not asked', () => {
    const s = crmSettings['customers.birthday'];
    expect(s.version).toBe(200);
    expect(s.default).toEqual({ enabled: false, askYear: false });
    expect(birthdaySettingsSchema.safeParse({ ...s.default, gift: true }).success).toBe(false);
  });

  it('PR 301: a birthday without a year is stored on the marker year and read back as no year', () => {
    const noYear = birthdayDate({ day: 29, month: 2, year: null })!;
    expect(noYear.toISOString().slice(0, 10)).toBe(`${BIRTHDAY_NO_YEAR}-02-29`);
    expect(birthdayParts(noYear)).toEqual({ day: 29, month: 2, year: null });
    expect(birthdayParts(birthdayDate({ day: 5, month: 11, year: 1990 }))).toEqual({ day: 5, month: 11, year: 1990 });
    expect(birthdayParts(new Date('1990-11-05'))).toEqual({ day: 5, month: 11, year: 1990 });
    expect(birthdayDate({ day: 31, month: 4, year: null })).toBeNull();
    expect(birthdayDate({ day: 29, month: 2, year: 2001 })).toBeNull();
    expect(birthdayDate({ day: 0, month: 1, year: null })).toBeNull();
    expect(birthdayDate({ day: 1, month: 13, year: null })).toBeNull();
    expect(birthdayDate({ day: 1.5, month: 1, year: null })).toBeNull();
    expect(birthdayParts(null)).toBeNull();
  });

  it('PR 303: the customer report is off as shipped (v201); its numbers stay in range', () => {
    const s = crmSettings['customers.report'];
    expect(s.version).toBe(201);
    expect(s.default).toEqual({ enabled: false, quietDays: 60, segmentsShown: 10 });
    expect(customerReportSettingsSchema.safeParse({ ...s.default, quietDays: 3 }).success).toBe(false);
    expect(customerReportSettingsSchema.safeParse({ ...s.default, segmentsShown: 0 }).success).toBe(false);
    expect(customerReportSettingsSchema.safeParse({ ...s.default, send: true }).success).toBe(false);
  });

  it('PR 533: the customer history at approval is off as shipped (v202); it only shows, its list sizes stay in range', () => {
    const s = crmSettings['customers.approvalHistory'];
    expect(s.version).toBe(202);
    expect(s.default).toEqual({ enabled: false, recent: 5, reasonsShown: 5 });
    expect(approvalHistorySettingsSchema.safeParse({ ...s.default, recent: 0 }).success).toBe(false);
    expect(approvalHistorySettingsSchema.safeParse({ ...s.default, reasonsShown: 21 }).success).toBe(false);
    expect(approvalHistorySettingsSchema.safeParse({ ...s.default, autoConfirm: true }).success).toBe(false);
  });
});
