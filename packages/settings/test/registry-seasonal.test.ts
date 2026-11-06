// S12 · PR 246 — `marketing.seasonal`: off as it ships, every number the owner's within its range, the occasions the
// owner's (Eid, winter, Puja to start), and its words in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages, registry, seasonalSettingsSchema } from '../src/index';

describe('marketing.seasonal (PR 246)', () => {
  const spec = registry['marketing.seasonal'];

  it('ships off, per store, at version 228, with a default the schema accepts', () => {
    expect(spec.scope).toBe('store');
    expect(spec.version).toBe(228);
    expect(spec.default.enabled).toBe(false);
    expect(spec.default.occasions.map((o) => o.key)).toEqual(['eid', 'winter', 'puja']);
    expect(spec.default.cutoffOccasions).toEqual({ eid: true });
    expect(spec.isOwnerData).toBe(false);
    expect(seasonalSettingsSchema.safeParse(spec.default).success).toBe(true);
  });

  it('keeps numbers in range, occasion keys as link parts, no twin keys and no unknown fields', () => {
    const ok = (v: object) => seasonalSettingsSchema.safeParse({ ...spec.default, ...v }).success;
    expect(ok({ productsMax: 0 })).toBe(false);
    expect(ok({ productsMax: 61 })).toBe(false);
    expect(ok({ articlesMax: 13 })).toBe(false);
    expect(ok({ occasions: [] })).toBe(false);
    expect(ok({ occasions: [{ key: 'Eid ul', en: 'Eid', bn: 'ঈদ' }] })).toBe(false);
    expect(ok({ occasions: [{ key: 'eid', en: 'Eid', bn: 'ঈদ' }, { key: 'eid', en: 'Eid 2', bn: 'ঈদ ২' }] })).toBe(false);
    expect(ok({ occasions: [{ key: 'pohela-boishakh', en: 'Pohela Boishakh', bn: 'পহেলা বৈশাখ' }] })).toBe(true);
    expect(ok({ cutoffOccasions: { 'Not A Key': true } })).toBe(false);
    expect(ok({ cutoffOccasions: {} })).toBe(true);
    expect(ok({ extra: 1 })).toBe(false);
  });

  it('has its words in English and Bengali', () => {
    for (const k of [spec.labelKey, spec.helpKey ?? '']) {
      expect(lookup(messages.en, k), k).toBeTruthy();
      expect(lookup(messages.bn, k), k).toBeTruthy();
    }
  });
});
