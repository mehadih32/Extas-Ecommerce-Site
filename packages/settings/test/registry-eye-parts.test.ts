// S02 · PR 80 follow-up 679 (registry v265) — the demo's eye-toggles whose parts the shop did not draw: checkout's
// "Ordered before? Log in", the door note (its words only the owner's, empty as shipped), the desktop help strip, the
// bag's "Send my bag on WhatsApp", the thank-you page's upsell and the set line. Each is an eye-toggle of PR 80.
import { describe, expect, it } from 'vitest';
import { EYE_TOGGLES, eyeDefault, eyeToggleProblems } from '../src/eye-toggles';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { doorNoteTextSchema, eyePartSettings, thanksUpsellSchema } from '../src/registry-eye-parts';
import type { SettingSpec } from '../src/define';

const REG = registry as unknown as Readonly<Record<string, SettingSpec>>;

describe('eye parts (v265)', () => {
  it('every key at version 265, store-level, never owner data, labelled in English and Bengali', () => {
    for (const [key, spec] of Object.entries(eyePartSettings)) {
      expect(REG[key], key).toBe(spec);
      expect(spec.version).toBe(265);
      expect(spec.scope).toBe('store');
      expect(spec.isOwnerData).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('new parts are off as shipped; the set line the bag already draws stays on (Blueprint D4.1 upsell.setLine On)', () => {
    expect(eyePartSettings['checkout.loginNudge'].default).toBe(false);
    expect(eyePartSettings['checkout.doorNote'].default).toBe(false);
    expect(eyePartSettings['checkout.helpStripDesktop'].default).toBe(false);
    expect(eyePartSettings['bag.waSendBag'].default).toBe(false);
    expect(eyePartSettings['thanks.upsell'].default).toEqual({ enabled: false, count: 4 });
    expect(eyePartSettings['bag.upsell.setLine'].default).toBe(true);
  });

  it('the door note ships with no words at all (a Cash on Delivery promise is only ever the owner’s)', () => {
    expect(eyePartSettings['checkout.doorNote.text'].default).toEqual({ en: '', bn: '' });
    expect(doorNoteTextSchema.safeParse({ en: 'x'.repeat(161), bn: '' }).success).toBe(false);
    expect(doorNoteTextSchema.safeParse({ en: 'Owner words', bn: '' }).success).toBe(true);
    expect(doorNoteTextSchema.safeParse({ en: '' }).success).toBe(false);
  });

  it('the thank-you upsell count stays 1–8', () => {
    for (const v of [{ enabled: true, count: 0 }, { enabled: true, count: 9 }, { enabled: 'yes', count: 4 }, { enabled: true }])
      expect(thanksUpsellSchema.safeParse(v).success).toBe(false);
  });

  it('each switch is an eye-toggle with the right place and screen, and the list stays whole', () => {
    const want: Record<string, [string, string]> = {
      'checkout.loginNudge:': ['checkout', 'both'],
      'checkout.doorNote:': ['checkout', 'both'],
      'checkout.helpStripDesktop:': ['checkout', 'desktop'],
      'bag.waSendBag:': ['bag', 'both'],
      'bag.upsell.setLine:': ['bag', 'both'],
      'thanks.upsell:enabled': ['checkout', 'both'],
    };
    for (const [id, [area, screen]] of Object.entries(want)) {
      const t = EYE_TOGGLES.find((x) => x.id === id);
      expect(t, id).toMatchObject({ area, screen });
      expect(eyeDefault(t!, REG), id).toBe(id === 'bag.upsell.setLine:');
    }
    expect(eyeToggleProblems(REG)).toEqual([]);
  });
});
