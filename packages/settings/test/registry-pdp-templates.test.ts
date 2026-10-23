// S02 · the product page templates and Find My Size (PR 50–52, 58): every key at version 28, labelled in both languages,
// the demo's defaults, and the limits.
import { describe, expect, it } from 'vitest';
import { registryVersion } from '../src/define';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { pdpTemplateSettings, pdpTemplatesSchema } from '../src/registry-pdp-templates';

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
});
