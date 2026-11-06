// S02 · PR 80: the eye-toggle list against the real registry — every eye-toggle points at a yes/no value of a per-store
// setting, every yes/no value of a shop page setting is an eye-toggle or named in NOT_EYE, the defaults are Blueprint
// D4.1's (with the round-15 changes), and reading and writing one value keeps every other value as it was.
import { describe, expect, it } from 'vitest';
import { boolPaths, EYE_AREAS, EYE_KEYS, EYE_TOGGLES, eyeDefault, eyeToggle, eyeToggleProblems, readEye, writeEye } from '../src/eye-toggles';
import { registry } from '../src/registry';
import type { SettingSpec } from '../src/define';

const reg = registry as unknown as Record<string, SettingSpec>;

/** Blueprint D4 / D4.1 switch → the eye-toggle that is it, and its default (V2 · 19 Oct values). */
const D41: Record<string, [string, boolean]> = {
  'pdp.colourNote': ['pdp.colour:note', false],
  'pdp.trueColourLink': ['pdp.colour:trueColourLink', false],
  'pdp.fitBar': ['pdp.size:fitBar', false],
  'pdp.unitToggle': ['pdp.size:unitToggle', false],
  'pdpIcons.panel': ['pdp.icons:panel', false],
  'pdpIcons.share': ['pdp.icons:share', false],
  'pdpIcons.whatsapp': ['pdp.icons:whatsapp', false],
  'pdpSweep.freeDelivery': ['pdp.sweep:freeDelivery', true],
  'pdpSweep.stock': ['pdp.sweep:stock', true],
  'pdpSweep.allColours': ['pdp.sweep:allColours', true],
  'pdpSweep.colourLabel': ['pdp.sweep:colourLabel', true],
  'pdpSweep.sizeLabel': ['pdp.sweep:sizeLabel', true],
  'pdpSweep.sizePills': ['pdp.sweep:sizePills', true],
  'pdpPrice.discountAfterBar': ['pdp.price:discountAfterBar', true],
  'fab.whatsapp': ['shell.fab:on', false],
  'header.whatsapp': ['shell.header:icons.#whatsapp.on', true],
  HDR_WISH_PHONE: ['shell.header:wishOnPhone', true],
  'header slogan': ['shell.header:slogan.on', true],
  'category.breadcrumb': ['category.page:breadcrumb', true],
  'bag.waAboveTotal': ['bag.whatsappHelp:', false],
  'thanks.nextSteps': ['thanks.page:nextSteps', false],
  'upsell.bag': ['bag.upsell.enabled:', true],
  'upsell.why': ['bag.upsell.reasons:', true],
};

describe('eye-toggles (PR 80)', () => {
  it('has no problem against the registry: real yes/no values, per store, every shop switch listed or explained', () => {
    expect(eyeToggleProblems(reg)).toEqual([]);
  });

  it('keeps Blueprint D4.1 defaults', () => {
    for (const [name, [id, def]] of Object.entries(D41)) {
      const t = eyeToggle(id);
      expect(t, name).toBeDefined();
      expect(eyeDefault(t!, reg), name).toBe(def);
    }
  });

  it('gives every eye-toggle a known place and a unique id', () => {
    expect(new Set(EYE_TOGGLES.map((t) => t.id)).size).toBe(EYE_TOGGLES.length);
    for (const t of EYE_TOGGLES) expect(EYE_AREAS).toContain(t.area);
    expect(EYE_KEYS.length).toBe(new Set(EYE_TOGGLES.map((t) => t.key)).size);
  });

  it('finds an unlisted shop switch', () => {
    const fake = { ...reg, 'pdp.newThing': { ...reg['pdp.colour']!, default: { a: true, b: { c: false } } } } as Record<string, SettingSpec>;
    expect(eyeToggleProblems(fake)).toEqual(['not listed: pdp.newThing:a', 'not listed: pdp.newThing:b.c']);
  });

  it('reads and writes one value, by path and by list item id, and keeps the rest', () => {
    const v = { icons: [{ id: 'whatsapp', on: true }, { id: 'bag', on: true }], slogan: { on: true, phone: false }, text: 'x' };
    expect(readEye(v, 'icons.#bag.on')).toBe(true);
    expect(readEye(v, 'slogan.phone')).toBe(false);
    expect(readEye(v, 'text')).toBeUndefined();
    expect(readEye(v, 'icons.#nope.on')).toBeUndefined();
    const w = writeEye(v, 'icons.#bag.on', false) as typeof v;
    expect(w.icons[1]!.on).toBe(false);
    expect(w.icons[0]!.on).toBe(true);
    expect(v.icons[1]!.on).toBe(true); // the old value untouched
    expect((writeEye(v, 'slogan.phone', true) as typeof v).slogan).toEqual({ on: true, phone: true });
    expect(writeEye(false, '', true)).toBe(true);
    expect(() => writeEye(v, 'text', true)).toThrow('EYE_PATH');
    expect(boolPaths(v)).toEqual(['icons.#whatsapp.on', 'icons.#bag.on', 'slogan.on', 'slogan.phone']);
  });
});
