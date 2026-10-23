// The storefront follow-ups (registry v25): every key at version 25, public, with both labels; the demo's defaults where
// the demo has the feature, off otherwise (CN-018); the owner's own words are owner data and ship empty.
import { describe, expect, it } from 'vitest';
import { messages, lookup } from '../src/messages';
import { registry } from '../src/registry';
import { cardDeskSchema, pdpSizeWordsSchema, pdpUsualSizeSchema, storefrontFuSettings, structuredDataSchema } from '../src/registry-storefront-fu';

const OWNER_DATA: readonly string[] = ['pdp.sizeWords'];

describe('storefront follow-up settings (v25)', () => {
  it('every key is in the registry at version 25, public, with both labels; only the owner`s own words are owner data', () => {
    for (const [key, spec] of Object.entries(storefrontFuSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(25);
      expect(spec.isPublic, key).toBe(true);
      expect(spec.isOwnerData, key).toBe(OWNER_DATA.includes(key));
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${lang} ${key}`).toBeTruthy();
        if (spec.helpKey) expect(lookup(messages[lang], spec.helpKey), `${lang} ${key}`).toBeTruthy();
      }
    }
  });

  it('follow-up 21: the card`s back view and Quick add are on, as in the demo (DESK_A), and nothing else is accepted', () => {
    expect(storefrontFuSettings['card.desk'].default).toEqual({ altView: true, quickAdd: true });
    expect(cardDeskSchema.safeParse({ altView: true, quickAdd: true, touch: true }).success).toBe(false);
  });

  it('follow-ups 35, 61: the structured data is on (it says only what the page shows) and has no rating switch', () => {
    expect(storefrontFuSettings['seo.structuredData'].default).toEqual({ breadcrumbs: true, itemList: true, product: true });
    expect(structuredDataSchema.safeParse({ breadcrumbs: true, itemList: true, product: true, rating: true }).success).toBe(false);
  });

  it('follow-up 62: the size words are the owner`s (empty), "Your size" is off; only real size keys take a word', () => {
    expect(storefrontFuSettings['pdp.sizeWords'].default).toBeNull();
    expect(storefrontFuSettings['pdp.usualSize'].default).toEqual({ on: false, preselect: false, days: 180 });
    expect(pdpSizeWordsSchema.safeParse({ show: 'bn', words: { m: { en: '', bn: 'মাঝারি' } } }).success).toBe(true);
    expect(pdpSizeWordsSchema.safeParse({ show: 'bn', words: { 'M L': { en: '', bn: 'x' } } }).success).toBe(false);
    expect(pdpSizeWordsSchema.safeParse({ show: 'bn', words: { m: { en: '', bn: 'অনেক লম্বা একটা শব্দ যা ধরবে না' } } }).success).toBe(false);
    expect(pdpUsualSizeSchema.safeParse({ on: true, preselect: false, days: 0 }).success).toBe(false);
  });
});
