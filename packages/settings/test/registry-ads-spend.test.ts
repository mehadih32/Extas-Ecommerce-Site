// S13 · PR 265 (registry v172): the daily ad spend import — at version 172, never owner data, labelled in both languages,
// off as it ships, every value bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adsSpendImportSchema, adsSpendSettings, SPEND_DAYS_MAX } from '../src/registry-ads-spend';

describe('ads.spendImport (v172)', () => {
  it('is in the registry at version 172, store-level, labelled in English and Bengali', () => {
    const spec = adsSpendSettings['ads.spendImport'];
    expect(registry['ads.spendImport']).toBe(spec);
    expect(spec.version).toBe(172);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off, and refuses what is out of range', () => {
    const d = adsSpendSettings['ads.spendImport'].default;
    expect(d.on).toBe(false);
    expect(adsSpendImportSchema.safeParse(d).success).toBe(true);
    for (const bad of [{ days: 0 }, { days: SPEND_DAYS_MAX + 1 }, { days: 1.5 }, { hour: 24 }, { hour: -1 }, { on: 'yes' }, { extra: 1 }]) expect(adsSpendImportSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });
});
