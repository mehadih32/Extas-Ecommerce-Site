// S02 · the product page templates and Find My Size (PR 50–52, 58): every key at version 28, labelled in both languages,
// the demo's defaults, and the limits.
import { describe, expect, it } from 'vitest';
import { registryVersion } from '../src/define';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { pdpFinderSchema, pdpTemplateSettings, pdpTemplatesSchema } from '../src/registry-pdp-templates';

describe('product page template settings (v28)', () => {
  it('every key is in the registry at version 28, public, never owner data, labelled in English and Bengali', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(28);
    for (const [key, spec] of Object.entries(pdpTemplateSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(28);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(true);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${lang} ${key}`).toBeTruthy();
        if (spec.helpKey) expect(lookup(messages[lang], spec.helpKey), `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it('T1 stays the default; a product may choose its own; the preview is on', () => {
    const d = pdpTemplateSettings['pdp.templates'].default;
    expect(d.default).toBe('T1');
    expect(d.byCategory).toEqual({});
    expect(d.perProduct).toBe(true);
    expect(d.preview).toBe(true);
  });

  it('only known templates, real link names, and no extra fields', () => {
    const d = pdpTemplateSettings['pdp.templates'].default;
    expect(pdpTemplatesSchema.safeParse({ ...d, default: 'T9' }).success).toBe(false);
    expect(pdpTemplatesSchema.safeParse({ ...d, byCategory: { polos: 'T2' } }).success).toBe(true);
    expect(pdpTemplatesSchema.safeParse({ ...d, byCategory: { polos: 'T4' } }).success).toBe(false);
    expect(pdpTemplatesSchema.safeParse({ ...d, byCategory: { 'Not A Slug': 'T2' } }).success).toBe(false);
    expect(pdpTemplatesSchema.safeParse({ ...d, extra: 1 }).success).toBe(false);
  });

  it('T2 (PR 50): the demo strip and stacked columns, each look on its own switch, with limits', () => {
    const d = pdpTemplateSettings['pdp.templates'].default;
    expect(d.t2).toEqual({ peekPct: 88, deskColumns: 2, deskBuyPx: 410, thumbs: true, editorialTitle: true, surface: true });
    expect(pdpTemplatesSchema.safeParse({ ...d, t2: { ...d.t2, peekPct: 59 } }).success).toBe(false);
    expect(pdpTemplatesSchema.safeParse({ ...d, t2: { ...d.t2, deskColumns: 4 } }).success).toBe(false);
    expect(pdpTemplatesSchema.safeParse({ ...d, t2: { ...d.t2, deskBuyPx: 300 } }).success).toBe(false);
    expect(pdpTemplatesSchema.safeParse({ ...d, t2: { ...d.t2, deskColumns: 1.5 } }).success).toBe(false);
  });

  it('T3 (PR 51): the finder, the measurements and the open reasons in the card, thumbnails under the photo', () => {
    const d = pdpTemplateSettings['pdp.templates'].default;
    expect(d.t3).toEqual({ inlineFinder: true, measures: true, whyOpen: true, deskThumbs: 'below' });
    expect(pdpTemplatesSchema.safeParse({ ...d, t3: { ...d.t3, deskThumbs: 'side' } }).success).toBe(true);
    expect(pdpTemplatesSchema.safeParse({ ...d, t3: { ...d.t3, deskThumbs: 'top' } }).success).toBe(false);
    expect(pdpTemplatesSchema.safeParse({ ...d, t3: { ...d.t3, extra: true } }).success).toBe(false);
  });

  it('Find My Size (PR 58): on with its card, the demo arithmetic, and the ranges hold together', () => {
    const f = pdpTemplateSettings['pdp.finder'].default;
    expect(f.on).toBe(true);
    expect(f.card).toBe(true);
    expect([f.startHeightIn, f.startWeightKg, f.heightMinIn, f.heightMaxIn, f.weightMinKg, f.weightMaxKg]).toEqual([67, 66, 54, 84, 35, 150]);
    expect(f.body.map((b) => [b.field, b.kind])).toEqual([
      ['chest', 'top'],
      ['waist', 'bottom'],
    ]);
    expect(f.toleranceInch).toBe(0.5);
    expect(f.length.byGarment.panjabi).toBe(0.6);
    expect([f.holdMs, f.repeatMs]).toEqual([450, 90]);
    const valid = (patch: Record<string, unknown>) => pdpFinderSchema.safeParse({ ...f, ...patch }).success;
    expect(valid({ heightMinIn: 84 })).toBe(false);
    expect(valid({ startHeightIn: 90 })).toBe(false);
    expect(valid({ weightMaxKg: 30 })).toBe(false);
    expect(valid({ body: [] })).toBe(false);
    expect(valid({ body: [f.body[0], f.body[0]] })).toBe(false);
    expect(valid({ body: [{ ...f.body[0]!, field: 'Chest Size' }] })).toBe(false);
    expect(valid({ holdMs: 100 })).toBe(false);
    expect(valid({ rememberDays: 0 })).toBe(false);
    expect(valid({ length: { ...f.length, byGarment: { 'Polo Shirt': 0.4 } } })).toBe(false);
  });
});
