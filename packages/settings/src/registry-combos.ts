// S03 · PR 89–104, 571, 575 — combos and sets (Sawdagor). The combos themselves are rows (Combo, ComboItem,
// ComboAutoRule): their names, pieces and set prices are the owner's and are typed in on /admin/combos. These settings
// only hold how the combo engine works: how a "% off" pack price is rounded, how many pairs one rule may make, the
// season tabs, how long a new colour carries its tag, the shop's default page and bag templates, the bag's repeat
// guard and re-pricing, the set photo's background and size, and the report's window.
// Labels: messages/combos.<lang>.json. Registry version 14.
//
// Money never sits here: set prices are the owner's, entered per combo or per rule (the `combos.prices` permission,
// CLAUDE.md rule 6). A struck "was" price is only ever the sum of the pieces' own prices (CN-009) and shows only when
// the owner has switched struck prices on (`rules.discount.showWasPrice`).
import { z } from 'zod';
import { setting } from './define';
import { dictionarySchema } from './schemas';

const V = 14;

/** How a "% off the regular total" pack price is rounded to the rounding step. */
export const comboRoundingSchema = z.enum(['down', 'nearest', 'up']);
/** Category page templates of a combo rule (demo ACW_LIST, PR 572). */
export const comboListTemplateSchema = z.enum(['L1', 'L2', 'L3', 'L4', 'L5']);
/** Combo product page templates (demo ACW_PAGE, PR 573): auto = P1, or P2 when there are many colours. */
export const comboPageTemplateSchema = z.enum(['auto', 'P1', 'P2', 'P3', 'P4', 'P5']);
/** How a combo shows in the bag (demo CBT_LIST, PR 574). */
export const comboBagTemplateSchema = z.enum(['current', 'B1', 'B2', 'B3', 'B4', 'B5']);
export const comboPhotoFormatSchema = z.enum(['webp', 'jpeg']);

export const combosSettings = {
  // ---- PR 89, 96, 571 · the pack price ----
  'combos.price.roundingStepMinor': setting({
    schema: z.int().min(1).max(100_000),
    default: 1000,
    scope: 'store',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.price.roundingStepMinor.label',
    helpKey: 'combos.price.roundingStepMinor.help',
    isOwnerData: false,
    sortOrder: 10,
    version: V,
  }),
  'combos.price.rounding': setting({
    schema: comboRoundingSchema,
    // Down: a "% off" pack never costs more than the share it promises.
    default: 'down',
    scope: 'store',
    valueType: 'ENUM',
    group: 'combos',
    labelKey: 'combos.price.rounding.label',
    helpKey: 'combos.price.rounding.help',
    isOwnerData: false,
    sortOrder: 20,
    version: V,
  }),
  // ---- PR 571 · the generator ----
  'combos.generate.maxPairsPerRule': setting({
    schema: z.int().min(10).max(5000),
    default: 600,
    scope: 'installation',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.generate.maxPairsPerRule.label',
    helpKey: 'combos.generate.maxPairsPerRule.help',
    isOwnerData: false,
    sortOrder: 30,
    version: V,
  }),
  'combos.newColourDays': setting({
    schema: z.int().min(0).max(365),
    default: 14,
    scope: 'store',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.newColourDays.label',
    helpKey: 'combos.newColourDays.help',
    isOwnerData: false,
    sortOrder: 40,
    version: V,
  }),
  'combos.seasons': setting({
    schema: dictionarySchema,
    default: [
      { key: 'summer', en: 'Summer', bn: 'গরম' },
      { key: 'winter', en: 'Winter', bn: 'শীত' },
    ],
    scope: 'store',
    valueType: 'JSON',
    group: 'combos',
    labelKey: 'combos.seasons.label',
    helpKey: 'combos.seasons.help',
    isOwnerData: false,
    sortOrder: 50,
    version: V,
  }),
  // ---- PR 572–574 · the shop's default templates (a rule may choose its own) ----
  'combos.template.list': setting({
    schema: comboListTemplateSchema,
    default: 'L1',
    scope: 'store',
    valueType: 'ENUM',
    group: 'combos',
    labelKey: 'combos.template.list.label',
    helpKey: 'combos.template.list.help',
    isOwnerData: false,
    sortOrder: 60,
    version: V,
  }),
  'combos.template.page': setting({
    schema: comboPageTemplateSchema,
    default: 'auto',
    scope: 'store',
    valueType: 'ENUM',
    group: 'combos',
    labelKey: 'combos.template.page.label',
    helpKey: 'combos.template.page.help',
    isOwnerData: false,
    sortOrder: 70,
    version: V,
  }),
  'combos.template.bag': setting({
    schema: comboBagTemplateSchema,
    default: 'current',
    scope: 'store',
    valueType: 'ENUM',
    group: 'combos',
    labelKey: 'combos.template.bag.label',
    helpKey: 'combos.template.bag.help',
    isOwnerData: false,
    sortOrder: 80,
    version: V,
  }),
  // ---- PR 90 · the admin ----
  'combos.admin.previewCount': setting({
    schema: z.int().min(4).max(200),
    default: 24,
    scope: 'installation',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.admin.previewCount.label',
    helpKey: 'combos.admin.previewCount.help',
    isOwnerData: false,
    sortOrder: 90,
    version: V,
  }),
  // ---- PR 97 · the bag ----
  'combos.bag.repeatGuardMs': setting({
    schema: z.int().min(0).max(10_000),
    default: 1200,
    scope: 'installation',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.bag.repeatGuardMs.label',
    helpKey: 'combos.bag.repeatGuardMs.help',
    isOwnerData: false,
    sortOrder: 100,
    version: V,
  }),
  'combos.bag.followPriceChanges': setting({
    schema: z.boolean(),
    default: true,
    scope: 'store',
    valueType: 'BOOLEAN',
    group: 'combos',
    labelKey: 'combos.bag.followPriceChanges.label',
    helpKey: 'combos.bag.followPriceChanges.help',
    isOwnerData: false,
    sortOrder: 110,
    version: V,
  }),
  // ---- PR 575 · the set photo ----
  'combos.photo.background': setting({
    schema: z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'a colour such as #ffffff' }),
    default: '#ECE9E3',
    scope: 'store',
    valueType: 'COLOR',
    group: 'combos',
    labelKey: 'combos.photo.background.label',
    helpKey: 'combos.photo.background.help',
    isOwnerData: false,
    sortOrder: 120,
    version: V,
  }),
  'combos.photo.widthPx': setting({
    schema: z.int().min(320).max(4000),
    default: 1200,
    scope: 'store',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.photo.widthPx.label',
    helpKey: 'combos.photo.widthPx.help',
    isOwnerData: false,
    sortOrder: 130,
    version: V,
  }),
  'combos.photo.heightPx': setting({
    schema: z.int().min(320).max(4000),
    default: 900,
    scope: 'store',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.photo.heightPx.label',
    helpKey: 'combos.photo.heightPx.help',
    isOwnerData: false,
    sortOrder: 140,
    version: V,
  }),
  'combos.photo.format': setting({
    schema: comboPhotoFormatSchema,
    default: 'webp',
    scope: 'store',
    valueType: 'ENUM',
    group: 'combos',
    labelKey: 'combos.photo.format.label',
    helpKey: 'combos.photo.format.help',
    isOwnerData: false,
    sortOrder: 150,
    version: V,
  }),
  'combos.photo.quality': setting({
    schema: z.int().min(40).max(100),
    default: 84,
    scope: 'store',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.photo.quality.label',
    helpKey: 'combos.photo.quality.help',
    isOwnerData: false,
    sortOrder: 160,
    version: V,
  }),
  // ---- PR 104 · the report ----
  'combos.report.defaultDays': setting({
    schema: z.int().min(1).max(365),
    default: 30,
    scope: 'store',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.report.defaultDays.label',
    helpKey: 'combos.report.defaultDays.help',
    isOwnerData: false,
    sortOrder: 170,
    version: V,
  }),
  'combos.report.topCount': setting({
    schema: z.int().min(3).max(100),
    default: 10,
    scope: 'installation',
    valueType: 'INT',
    group: 'combos',
    labelKey: 'combos.report.topCount.label',
    helpKey: 'combos.report.topCount.help',
    isOwnerData: false,
    sortOrder: 180,
    version: V,
  }),
};
