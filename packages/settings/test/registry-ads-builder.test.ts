// S13 · PR 531 (registry v219): the campaign builder — at version 219, off as it ships, never owner data, labelled in
// both languages; nothing but the switch.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adsBuilderSettings, adsCampaignBuilderSchema } from '../src/registry-ads-builder';

describe('ads.campaignBuilder (v219)', () => {
  it('is in the registry at version 219, store-level, off, labelled in English and Bengali', () => {
    const spec = adsBuilderSettings['ads.campaignBuilder'];
    expect(registry['ads.campaignBuilder']).toBe(spec);
    expect(spec.version).toBe(219);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toEqual({ enabled: false });
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('takes only the switch', () => {
    expect(adsCampaignBuilderSchema.safeParse({ enabled: true }).success).toBe(true);
    for (const bad of [{}, { enabled: 'yes' }, { enabled: true, extra: 1 }]) expect(adsCampaignBuilderSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});
