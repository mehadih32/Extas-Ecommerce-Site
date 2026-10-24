// The combo templates (S03 · PR 572–574, registry v39): every key at version 39, public, with both labels; the demo's
// own numbers, and nothing else accepted — no price and no perk (the set prices are the owner's, per combo or rule).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { comboBagCompactSchema, comboListPageSchema, comboPairPageSchema, comboTemplateSettings } from '../src/registry-combo-templates';

describe('combo template settings (v39)', () => {
  it('every key is in the registry at version 39, public, not owner data, with both labels', () => {
    for (const [key, spec] of Object.entries(comboTemplateSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(39);
      expect(spec.isPublic, key).toBe(true);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.group, key).toBe('combos');
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${lang} ${key}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it('the demo`s numbers: "See all" past 15 pairs with the first 8, six big cards, the builder card on; previews on', () => {
    expect(comboTemplateSettings['combos.list'].default).toEqual({ seeAllOver: 15, firstShown: 8, bigListShown: 6, builderCard: true });
    expect(comboTemplateSettings['combos.template.preview'].default).toBe(true);
    expect(comboTemplateSettings['combos.pairPage'].default).toEqual({ otherPairs: 14, packSwatches: 4, upsell: true });
  });

  it('PR 573: the pair page keeps the current look until the owner picks a template', () => {
    expect(registry['combos.template.page'].default).toBe('current');
    expect(registry['combos.template.page'].version).toBe(39);
    expect(registry['combos.template.page'].schema.safeParse('P4').success).toBe(true);
    expect(comboPairPageSchema.safeParse({ otherPairs: 14, packSwatches: 0, upsell: true }).success).toBe(false);
  });

  it('PR 574: the bag keeps the current look until the owner picks a template; B5 rows from 3 sets', () => {
    expect(registry['combos.template.bag'].default).toBe('current');
    expect(registry['combos.template.bag'].version).toBe(39);
    expect(registry['combos.template.bag'].schema.safeParse('B3').success).toBe(true);
    expect(comboTemplateSettings['combos.bag.compactFrom'].default).toBe(3);
    expect(comboBagCompactSchema.safeParse(0).success).toBe(false);
  });

  it('refuses what is not a setting of these pages', () => {
    const ok = comboTemplateSettings['combos.list'].default;
    expect(comboListPageSchema.safeParse({ ...ok, firstShown: 20 }).success).toBe(false);
    expect(comboListPageSchema.safeParse({ ...ok, seeAllOver: 0 }).success).toBe(false);
    expect(comboListPageSchema.safeParse({ ...ok, discount: 10 }).success).toBe(false);
  });
});
