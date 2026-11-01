// S13 · PR 255 — landing page templates, pure: the ready-made ones' parts, an own template's key, what a template keeps
// (never the countdown's end) and a stored template read back in the fixed order.
import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES, LANDING_SECTIONS, builtInSections, isBuiltInTemplate, landingInputSchema, ownTemplateKey, templateData, templateInputSchema, templateSectionsOf } from './landing-model';

describe('landing page templates (PR 255)', () => {
  it('every ready-made template keeps the fixed order, has the hero and the order box, no words, never the countdown', () => {
    for (const k of BUILT_IN_TEMPLATES) {
      const s = builtInSections(k);
      expect(s.map((x) => x.key)).toEqual([...LANDING_SECTIONS]);
      const on = s.filter((x) => x.on).map((x) => x.key);
      expect(on).toContain('hero');
      expect(on).toContain('form');
      expect(on).not.toContain('timer');
      expect(s.every((x) => Object.keys(x.config).length === 0)).toBe(true);
    }
    expect(builtInSections('fit-first').filter((x) => x.on).map((x) => x.key)).toEqual(['hero', 'size', 'reviews', 'form', 'faq']);
    expect(new Set(BUILT_IN_TEMPLATES.map((k) => builtInSections(k).map((x) => x.on).join())).size).toBe(BUILT_IN_TEMPLATES.length);
  });

  it('an own key starts with own-, is made from the name and never repeats or takes a ready-made key', () => {
    expect(ownTemplateKey('Eid polo — 2 pcs', new Set())).toBe('own-eid-polo-2-pcs');
    expect(ownTemplateKey('Eid polo — 2 pcs', new Set(['own-eid-polo-2-pcs', 'own-eid-polo-2-pcs-2']))).toBe('own-eid-polo-2-pcs-3');
    expect(ownTemplateKey('ঈদ', new Set())).toBe('own-template');
    expect(isBuiltInTemplate(ownTemplateKey('offer first', new Set()))).toBe(false);
    expect(ownTemplateKey('x'.repeat(80), new Set()).length).toBeLessThanOrEqual(44);
  });

  it('a template keeps the switches and words but not the countdown end; read back in the fixed order', () => {
    const d = templateData({
      timer: { on: true, config: { endsAt: '2026-12-01T00:00:00+06:00' } },
      hero: { on: true, config: { offer: { en: 'Any 2, cash on delivery', bn: null } } },
      benefits: { on: false, config: { lines: [{ en: 'Soft cotton', bn: 'নরম সুতি' }] } },
    });
    expect(d.v).toBe(1);
    expect(d.parts.timer).toEqual({ on: true, config: {} });
    const back = templateSectionsOf(d);
    expect(back.map((x) => x.key)).toEqual([...LANDING_SECTIONS]);
    expect(back.find((x) => x.key === 'hero')!.config.offer?.en).toBe('Any 2, cash on delivery');
    expect(back.find((x) => x.key === 'benefits')).toMatchObject({ on: false, config: { lines: [{ en: 'Soft cotton', bn: 'নরম সুতি' }] } });
    expect(back.find((x) => x.key === 'gallery')!.on).toBe(true);
  });

  it('a stored template kept badly falls back to the defaults part by part', () => {
    const back = templateSectionsOf({ v: 1, parts: { hero: { on: 'yes' }, reviews: { on: false }, nope: { on: true } } });
    expect(back.find((x) => x.key === 'hero')!.on).toBe(true);
    expect(back.find((x) => x.key === 'reviews')!.on).toBe(false);
    expect(templateSectionsOf(null).filter((x) => !x.on).map((x) => x.key)).toEqual(['timer']);
  });

  it('the inputs: a template needs a name; a page may name its template key in the link shape', () => {
    expect(templateInputSchema.safeParse({ name: ' ', sections: {} }).success).toBe(false);
    expect(templateInputSchema.safeParse({ name: 'A', sections: {}, price: 1 }).success).toBe(false);
    const page = { titleEn: 'P', slug: 'p', productId: '0190a0a0-0000-7000-8000-000000000001', sections: {} };
    expect(landingInputSchema.parse({ ...page, templateKey: 'offer-first' }).templateKey).toBe('offer-first');
    expect(landingInputSchema.parse(page).templateKey).toBeNull();
    expect(landingInputSchema.safeParse({ ...page, templateKey: 'Bad Key' }).success).toBe(false);
  });
});
