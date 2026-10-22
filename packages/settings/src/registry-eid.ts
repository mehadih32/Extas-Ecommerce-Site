// PR 214 follow-up (CN-014 g, simulation idea 19; SIM-F-019, SIM-F-033) — Eid order-by dates per delivery band and per
// district: the last day to order for delivery before Eid, the shop's banner words, the "may arrive after Eid" line
// for a place past its date, and pre-order with an advance after the dates. Its admin screen comes under Marketing ›
// Campaigns once the owner approves docs/ADMIN-ARCHITECTURE.md (CN-019); until then the API and these settings.
// Labels: messages/rules.<lang>.json (`rules.eid.*`); the starting words: `defaults.eid.*` there. Registry version 16.
//
// Off by default, and nothing of the owner's ships: the Eid day and every order-by date are empty until he types them
// (SIM-F-033: never fixed dates in code), so the feature cannot be switched on before they exist. Pre-order takes
// money, so its switch and its advance (a fixed amount or a percentage of the order, CN-018 answer 6) are owner data
// with no default and need his written OK (CLAUDE.md rule 6): until he sets them, nothing is offered after the dates.
import { z } from 'zod';
import { setting } from './define';
import { pair, messages } from './messages';
import { moneyMinorSchema, templateTextSchema } from './schemas';

const V = 16;

/** A calendar day, `YYYY-MM-DD` (read in the store's time zone). */
export const isoDaySchema = z.iso.date();

/** One order-by date per delivery band (the band's key, as in Delivery › bands). */
export const eidBandDatesSchema = z
  .array(z.object({ band: z.string().trim().min(1).max(40), orderBy: isoDaySchema }).strict())
  .max(20)
  .refine((rows) => new Set(rows.map((r) => r.band)).size === rows.length, { message: 'one date per band' });

/** A district's own order-by date (the gazetteer's district code); it wins over its band's date. */
export const eidDistrictDatesSchema = z
  .array(z.object({ district: z.string().trim().min(3).max(120), orderBy: isoDaySchema }).strict())
  .max(100)
  .refine((rows) => new Set(rows.map((r) => r.district)).size === rows.length, { message: 'one date per district' });

/** `HH:MM`, 24 h: the last minute of the order-by day that still counts. */
export const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'a time like 23:59' });

export const eidSettings = {
  'rules.eid.enabled': setting({
    schema: z.boolean(),
    default: false,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'rules',
    labelKey: 'rules.eid.enabled.label',
    helpKey: 'rules.eid.enabled.help',
    isOwnerData: false,
    sortOrder: 300,
    version: V,
  }),
  'rules.eid.eidDate': setting({
    schema: isoDaySchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'STRING',
    group: 'rules',
    labelKey: 'rules.eid.eidDate.label',
    helpKey: 'rules.eid.eidDate.help',
    isOwnerData: true,
    sortOrder: 310,
    version: V,
  }),
  'rules.eid.bandDates': setting({
    schema: eidBandDatesSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'rules',
    labelKey: 'rules.eid.bandDates.label',
    helpKey: 'rules.eid.bandDates.help',
    isOwnerData: true,
    sortOrder: 320,
    version: V,
  }),
  'rules.eid.districtDates': setting({
    schema: eidDistrictDatesSchema.nullable(),
    default: null,
    scope: 'store',
    valueType: 'JSON',
    group: 'rules',
    labelKey: 'rules.eid.districtDates.label',
    helpKey: 'rules.eid.districtDates.help',
    isOwnerData: true,
    sortOrder: 330,
    version: V,
  }),
  'rules.eid.cutoffTime': setting({
    schema: clockTimeSchema,
    default: '23:59',
    scope: 'store',
    valueType: 'STRING',
    group: 'rules',
    labelKey: 'rules.eid.cutoffTime.label',
    helpKey: 'rules.eid.cutoffTime.help',
    isOwnerData: false,
    sortOrder: 340,
    version: V,
  }),
  'rules.eid.showDaysBefore': setting({
    schema: z.int().min(1).max(90),
    default: 14,
    scope: 'store',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.eid.showDaysBefore.label',
    helpKey: 'rules.eid.showDaysBefore.help',
    isOwnerData: false,
    sortOrder: 350,
    version: V,
  }),
  'rules.eid.bannerText': setting({
    schema: templateTextSchema(['band', 'date'], 160),
    default: pair(messages, 'defaults.eid.bannerText'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'rules',
    labelKey: 'rules.eid.bannerText.label',
    helpKey: 'rules.eid.bannerText.help',
    isOwnerData: false,
    sortOrder: 360,
    version: V,
  }),
  'rules.eid.lateText': setting({
    schema: templateTextSchema(['eid'], 240),
    default: pair(messages, 'defaults.eid.lateText'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'rules',
    labelKey: 'rules.eid.lateText.label',
    helpKey: 'rules.eid.lateText.help',
    isOwnerData: false,
    sortOrder: 370,
    version: V,
  }),
  'rules.eid.preorder.enabled': setting({
    schema: z.boolean().nullable(),
    default: null,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'rules',
    labelKey: 'rules.eid.preorder.enabled.label',
    helpKey: 'rules.eid.preorder.enabled.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 380,
    version: V,
  }),
  'rules.eid.preorder.advanceMinor': setting({
    schema: moneyMinorSchema.min(1).nullable(),
    default: null,
    scope: 'store',
    valueType: 'MONEY_MINOR',
    group: 'rules',
    labelKey: 'rules.eid.preorder.advanceMinor.label',
    helpKey: 'rules.eid.preorder.advanceMinor.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 390,
    version: V,
  }),
  'rules.eid.preorder.advanceType': setting({
    schema: z.enum(['fixed', 'percent']),
    default: 'fixed',
    scope: 'store',
    valueType: 'STRING',
    group: 'rules',
    labelKey: 'rules.eid.preorder.advanceType.label',
    helpKey: 'rules.eid.preorder.advanceType.help',
    isOwnerData: false,
    sortOrder: 392,
    version: V,
  }),
  'rules.eid.preorder.advancePercent': setting({
    schema: z.int().min(1).max(100).nullable(),
    default: null,
    scope: 'store',
    valueType: 'INT',
    group: 'rules',
    labelKey: 'rules.eid.preorder.advancePercent.label',
    helpKey: 'rules.eid.preorder.advancePercent.help',
    isOwnerData: true,
    requiresOwnerOk: true,
    sortOrder: 394,
    version: V,
  }),
  'rules.eid.preorder.text': setting({
    schema: templateTextSchema(['advance', 'due', 'eid'], 240),
    default: pair(messages, 'defaults.eid.preorderText'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'rules',
    labelKey: 'rules.eid.preorder.text.label',
    helpKey: 'rules.eid.preorder.text.help',
    isOwnerData: false,
    sortOrder: 400,
    version: V,
  }),
  'rules.eid.preorder.bannerText': setting({
    schema: templateTextSchema(['advance', 'eid'], 200),
    default: pair(messages, 'defaults.eid.preorderBannerText'),
    scope: 'store',
    valueType: 'LOCALIZED_TEXT',
    group: 'rules',
    labelKey: 'rules.eid.preorder.bannerText.label',
    helpKey: 'rules.eid.preorder.bannerText.help',
    isOwnerData: false,
    sortOrder: 410,
    version: V,
  }),
};
