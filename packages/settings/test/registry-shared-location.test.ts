// S06 · PR 159 follow-up 324 (registry v268): where the team uses a shared location — never owner data, labelled in
// English and Bengali, both parts off as shipped, the map link an https address with {lat} and {lng}.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { sharedLocationSettings } from '../src/registry-shared-location';

describe('shared location setting (v268)', () => {
  it('orders.sharedLocation is in the registry at version 268, labelled in both languages, off by default', () => {
    const spec = sharedLocationSettings['orders.sharedLocation'];
    expect(registry['orders.sharedLocation']).toBe(spec);
    expect(spec.version).toBe(268);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default).toMatchObject({ orderPage: false, sticker: false });
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });

  it('the map link must be https and carry both {lat} and {lng}', () => {
    const s = sharedLocationSettings['orders.sharedLocation'].schema;
    const ok = (mapLink: string) => s.safeParse({ orderPage: true, sticker: false, mapLink }).success;
    expect(ok('https://maps.example.org/?q={lat},{lng}')).toBe(true);
    expect(ok('http://maps.example.org/?q={lat},{lng}')).toBe(false);
    expect(ok('javascript:alert({lat},{lng})')).toBe(false);
    expect(ok('https://maps.example.org/?q={lat}')).toBe(false);
    expect(ok('https://maps.example.org/ ?q={lat},{lng}')).toBe(false);
  });
});
