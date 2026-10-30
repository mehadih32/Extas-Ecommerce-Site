// CN-029 Phase 1 · Bhandari's lane (PR 609, 620; registry v65): every key at version 65, labelled in both languages, its
// default valid; nothing here is owner data or moves money, and every optional feature ships off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { bhandariP1Settings } from '../src/registry-bhandari-p1';

describe('Bhandari lane settings (v65)', () => {
  it('every key is in the registry at version 65, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(bhandariP1Settings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(65);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 609: the B-grade name suffix is a store setting with a short default; the floor stays the owner`s (v62)', () => {
    const s = bhandariP1Settings['catalogue.bGrade.nameSuffix'];
    expect([s.scope, s.default, s.schema.safeParse('x'.repeat(61)).success]).toEqual(['store', ' (B grade)', false]);
    expect([registry['catalogue.floor.minMarginPercent'].default, registry['catalogue.bGrade.listing'].default]).toEqual([null, false]);
    // qa-gate (30 Oct): the changed-buying-price list length is a setting.
    const shown = bhandariP1Settings['catalogue.shopPrice.changesShown'];
    expect([shown.scope, shown.default, shown.schema.safeParse(0).success]).toEqual(['installation', 100, false]);
  });
});
