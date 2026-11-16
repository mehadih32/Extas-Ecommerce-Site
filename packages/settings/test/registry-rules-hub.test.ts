// S28 · PR 678, 679 (registry v320): the pop-up hub texts and Peak and Eid mode — labelled in both languages, off and empty as shipped.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { PEAK_DEFAULT, POPUP_KEYS, STOCK_HOLD_DEFAULT, peakSchema, popupsSchema, rulesHubSettings, stockHoldSchema } from '../src/registry-rules-hub';

describe('rules hub settings (v320)', () => {
  it('both keys are in the registry at version 320 and labelled in both languages', () => {
    for (const key of ['rules.hub.popups', 'orders.peak'] as const) {
      const spec = rulesHubSettings[key];
      expect(registry[key]).toBe(spec);
      expect(spec.version).toBe(320);
      expect(spec.schema.safeParse(spec.default).success).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });
  it('twelve placements; nothing set as shipped; Peak mode is off with no cap', () => {
    expect(POPUP_KEYS).toHaveLength(12);
    expect(rulesHubSettings['rules.hub.popups'].default).toEqual({});
    expect(PEAK_DEFAULT).toEqual({ enabled: false, dailyCap: null, fullTextEn: '', fullTextBn: '', partSize: null, roster: [] });
  });
  it('a pop-up entry has a real window and a known key; the cap and the part are whole numbers', () => {
    const ok = { on: true, textEn: 'Hi', textBn: '', from: '2026-12-01', to: '2026-12-31', n: null };
    expect(popupsSchema.safeParse({ lowstock: { ...ok, n: 3 } }).success).toBe(true);
    expect(popupsSchema.safeParse({ nope: ok }).success).toBe(false);
    expect(popupsSchema.safeParse({ notice: { ...ok, from: '2026-12-31', to: '2026-12-01' } }).success).toBe(false);
    expect(popupsSchema.safeParse({ notice: { ...ok, from: '1 Dec' } }).success).toBe(false);
    expect(peakSchema.safeParse({ ...PEAK_DEFAULT, enabled: true, dailyCap: 300, partSize: 50 }).success).toBe(true);
    expect(peakSchema.safeParse({ ...PEAK_DEFAULT, dailyCap: 0 }).success).toBe(false);
    expect(peakSchema.safeParse({ ...PEAK_DEFAULT, roster: [{ name: 'Mim', task: 'Packing', from: '2026-12-02', to: '2026-12-01' }] }).success).toBe(false);
  });
  it('PR 947: the stock hold is empty as shipped (the installation numbers stand) and takes whole minutes and hours', () => {
    const spec = rulesHubSettings['inventory.stockHold'];
    expect(registry['inventory.stockHold']).toBe(spec);
    expect(spec.default).toEqual(STOCK_HOLD_DEFAULT);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
    expect(stockHoldSchema.safeParse({ checkoutMinutes: 20, placedHours: 12 }).success).toBe(true);
    expect(stockHoldSchema.safeParse({ checkoutMinutes: 0, placedHours: null }).success).toBe(false);
    expect(stockHoldSchema.safeParse({ checkoutMinutes: null, placedHours: 100 }).success).toBe(false);
  });
});
