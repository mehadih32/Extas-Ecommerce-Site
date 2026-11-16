// S28 · PR 1030 — the add-product wizard's pure rules.
import { describe, expect, it } from 'vitest';
import { canPublish, detailKeysFor, finderRows, profitOf, slugOf, stepFlags, suggestKeyword, suggestName, wizardSeo, type WizardSteps } from '../src';

const place = /bangladesh|\bbd\b|dhaka|cash on delivery/i;
const steps = (o: Partial<WizardSteps> = {}): WizardSteps => ({
  name: 'Navy polo',
  hasCategory: true,
  colours: 2,
  coloursWithoutFront: 0,
  priceMinor: 120_000,
  costMinor: 70_000,
  priceConfirmed: true,
  description: 'x'.repeat(50),
  hasGoogleText: true,
  kind: 'SINGLE',
  hasBottom: false,
  hasStyle: true,
  ...o,
});

describe('detail questions', () => {
  it('asks the garment type its own questions and the fabric only for an unknown one', () => {
    expect(detailKeysFor('polo')).toEqual(['fabric', 'gsm', 'collar', 'sleeve']);
    expect(detailKeysFor('trouser')).toContain('rise');
    expect(detailKeysFor('scarf')).toEqual(['fabric']);
    expect(detailKeysFor(null)).toEqual(['fabric']);
  });
});

describe('profit', () => {
  it('works profit and margin out from the buying price', () => {
    expect(profitOf(120_000, 70_000)).toEqual({ profitMinor: 50_000, marginPct: 41.7, belowCost: false });
    expect(profitOf(60_000, 70_000).belowCost).toBe(true);
    expect(profitOf(0, 70_000)).toEqual({ profitMinor: -70_000, marginPct: 0, belowCost: false });
  });
});

describe('name, keyword and link', () => {
  it('puts a foreign brand before the ERP name and the sub-category after a short one', () => {
    expect(suggestName({ brand: 'Zara', ownBrand: 'EXTAS', erpName: 'Polo', sub: 'Solid polo' })).toBe('Zara Polo Solid polo');
    expect(suggestName({ brand: 'EXTAS', ownBrand: 'EXTAS', erpName: 'Navy classic polo', sub: 'Solid polo' })).toBe('Navy classic polo');
    expect(suggestName({ brand: 'Zara', ownBrand: 'EXTAS', erpName: 'Zara classic polo', sub: null })).toBe('Zara classic polo');
  });
  it('suggests the category name and the place as the search word', () => {
    expect(suggestKeyword({ brand: 'Zara', ownBrand: 'EXTAS', categoryName: 'Polos', place: 'bd' })).toBe('zara polos bd');
    expect(suggestKeyword({ brand: null, ownBrand: null, categoryName: 'Polos', place: 'bd' })).toBe('polos bd');
  });
  it('makes a clean link', () => {
    expect(slugOf("  Men's Navy Polo — 220 GSM! ")).toBe('men-s-navy-polo-220-gsm');
  });
});

describe('size finder rows', () => {
  it('starts empty and keeps what was filled in', () => {
    const have = [{ size: 'M', h1: "5'5", h2: "5'8", w1: 58, w2: 66 }];
    expect(finderRows(['S', 'M'], have)).toEqual([{ size: 'S', h1: '', h2: '', w1: 0, w2: 0 }, have[0]]);
  });
});

describe('Google checks', () => {
  const good = { title: 'Navy classic polo for men | EXTAS', description: `${'Navy polo in cotton. '.repeat(5)}Cash on delivery in Dhaka.`, keyword: 'polo bd', pageText: 'x'.repeat(90), slug: 'navy-polo', coloursWithoutFront: 0 };
  it('scores 100 when every check passes', () => {
    const r = wizardSeo(good, place);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(r.score).toBe(100);
    expect(r.band).toBe('good');
  });
  it('takes the prototype points off for each failed check', () => {
    const r = wizardSeo({ ...good, title: 'short', keyword: '', coloursWithoutFront: 1 }, place);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(['title', 'keyword', 'alt']);
    expect(r.score).toBe(60);
    expect(wizardSeo({ title: '', description: '', keyword: '', pageText: '', slug: '', coloursWithoutFront: 3 }, place).score).toBe(20);
  });
});

describe('steps and publishing', () => {
  it('counts the steps as the prototype does', () => {
    expect(stepFlags(steps()).map((f) => f.ok)).toEqual([true, true, true, true, true, true, true, true]);
    const f = stepFlags(steps({ priceConfirmed: false, kind: 'SET', hasBottom: false }));
    expect(f.map((x) => x.ok)).toEqual([false, true, true, true, false, true, true, false]);
    expect(f[0]!.miss).toBe('bottom');
    expect(f[4]!.miss).toBe('pin');
    expect(stepFlags(steps({ priceMinor: 0 }))[4]!.miss).toBe('price');
  });
  it('lets a product go live only with a front photo for every colour and a confirmed price above cost', () => {
    expect(canPublish(steps())).toBe(true);
    expect(canPublish(steps({ coloursWithoutFront: 1 }))).toBe(false);
    expect(canPublish(steps({ priceConfirmed: false }))).toBe(false);
    expect(canPublish(steps({ priceMinor: 70_000 }))).toBe(false);
    expect(canPublish(steps({ colours: 0 }))).toBe(false);
  });
});
