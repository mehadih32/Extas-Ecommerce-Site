// "Build your own set" (S03 · PR 98, 100, registry v36): the one key at version 36, public, with both labels; off by
// default (Blueprint D3.9: customer-built sets sit behind a toggle, default OFF; CN-018), and nothing else accepted —
// no price, no perk: the set prices are the Smart Rules set tiers'.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { setBuilderSchema, setBuilderSettings } from '../src/registry-set-builder';

describe('set builder settings (v36)', () => {
  it('every key is in the registry at version 36, public, not owner data, with both labels', () => {
    for (const [key, spec] of Object.entries(setBuilderSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(36);
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

  it('ships off, offering every live set tier rule in every category once it is on', () => {
    expect(setBuilderSettings['combos.builder'].default).toEqual({ on: false, rules: [], categories: [], maxStyles: 24, perItem: true, entries: true });
  });

  it('refuses what is not a setting of the builder (a price, a bad key, a category by name, no styles)', () => {
    const ok = setBuilderSettings['combos.builder'].default;
    expect(setBuilderSchema.safeParse({ ...ok, rules: ['any-polos'], categories: ['0190f1c2-0000-7000-8000-000000000001'] }).success).toBe(true);
    expect(setBuilderSchema.safeParse({ ...ok, priceMinor: 150000 }).success).toBe(false);
    expect(setBuilderSchema.safeParse({ ...ok, rules: ['Any Polos'] }).success).toBe(false);
    expect(setBuilderSchema.safeParse({ ...ok, categories: ['polos'] }).success).toBe(false);
    expect(setBuilderSchema.safeParse({ ...ok, maxStyles: 0 }).success).toBe(false);
  });
});
