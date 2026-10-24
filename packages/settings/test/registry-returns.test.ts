// S08 · PR 185–191 (registry v57): every exchange, return and refused-parcel key at version 57 in the Orders group,
// never owner data, labelled in both languages, its default valid; money figures ship empty and new perks ship off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { exchangeEngineSchema, exchangeTiersSchema, returnsSettings } from '../src/registry-returns';

describe('exchange and return settings (v57)', () => {
  it('every key is in the registry at version 57 in the Orders group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(returnsSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(57);
      expect(spec.group, key).toBe('orders');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 185 (B1.8): the four tiers in order, all on; a wrong item needs its root cause (SIM-F-022); the new parcel waits for a person', () => {
    expect(returnsSettings['orders.exchange.tiers'].default).toEqual({ sameColour: true, otherColours: true, sameCategory: true, collectionFirst: true, otherCategories: true, maxOptions: 12 });
    expect(exchangeTiersSchema.safeParse({ ...returnsSettings['orders.exchange.tiers'].default, maxOptions: 0 }).success).toBe(false);
    const e = returnsSettings['orders.exchange.engine'].default;
    expect(e).toMatchObject({ rootCauseForWrong: true, autoConfirm: false, ourMistakePhoto: 'customer' });
    expect(exchangeEngineSchema.safeParse({ ...e, numberPrefix: 'x c' }).success).toBe(false);
    const causes = returnsSettings['orders.exchange.rootCauses'].default;
    expect(causes.map((c) => c.key)).toContain('wrong-pick');
    for (const c of causes) expect(c.bn.length, c.key).toBeGreaterThan(0);
  });
});
