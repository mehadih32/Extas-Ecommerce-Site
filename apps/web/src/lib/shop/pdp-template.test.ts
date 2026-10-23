// PR 52 — which template a product page uses: preview, the product's own, its category's (nearest first, the setting
// before the column), else the shop's default; an unknown key falls through.
import { describe, expect, it } from 'vitest';
import { isTemplate, templateFor } from './pdp-template';

const set = { default: 'T1' as const, byCategory: {}, perProduct: true, preview: true };

describe('templateFor', () => {
  it('nothing chosen anywhere gives the shop default (T1)', () => {
    expect(templateFor(set, { templateKey: null }, [])).toEqual({ template: 'T1', from: 'default' });
    expect(templateFor({ ...set, default: 'T3' }, { templateKey: null }, []).template).toBe('T3');
  });

  it("the product's own choice wins over its category, while perProduct is on", () => {
    const chain = [{ slug: 'polos', templateKey: 'T3' }];
    expect(templateFor(set, { templateKey: 'T2' }, chain)).toEqual({ template: 'T2', from: 'product' });
    expect(templateFor({ ...set, perProduct: false }, { templateKey: 'T2' }, chain)).toEqual({ template: 'T3', from: 'category' });
  });

  it('the nearest category decides; the setting beats the column on the same category', () => {
    const chain = [
      { slug: 'polos', templateKey: null },
      { slug: 'men', templateKey: 'T3' },
    ];
    expect(templateFor(set, { templateKey: null }, chain).template).toBe('T3');
    expect(templateFor({ ...set, byCategory: { men: 'T2' } }, { templateKey: null }, chain).template).toBe('T2');
    expect(templateFor({ ...set, byCategory: { polos: 'T1', men: 'T2' } }, { templateKey: null }, chain).template).toBe('T1');
  });

  it('an unknown template (a later T4, a typo) falls through to the next rule', () => {
    const chain = [{ slug: 'polos', templateKey: 'T4' }];
    expect(templateFor(set, { templateKey: 't2' }, chain)).toEqual({ template: 'T1', from: 'default' });
  });

  it('?template= previews only while the preview is on and only a known template', () => {
    expect(templateFor(set, { templateKey: 'T2' }, [], 'T3')).toEqual({ template: 'T3', from: 'preview' });
    expect(templateFor({ ...set, preview: false }, { templateKey: 'T2' }, [], 'T3').template).toBe('T2');
    expect(templateFor(set, { templateKey: null }, [], 'T7').template).toBe('T1');
    expect(isTemplate('T2')).toBe(true);
    expect(isTemplate(2)).toBe(false);
  });
});
