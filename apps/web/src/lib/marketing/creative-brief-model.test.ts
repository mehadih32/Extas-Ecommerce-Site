// S13 · PR 270 — the creative brief's draft: the offer keeps a compare-at price only when it is higher, the formats follow
// the owner's switches and numbers, the hooks and the picture line come from each language's words (one colour gets its
// own hook; "no words on the picture" adds its line), the landing address is the product's own page, and a person's
// corrections are trimmed, bounded and never blank.
import { describe, expect, it } from 'vitest';
import { adsBriefSettings } from '@extas/settings';
import { BRIEF_TEXT_MAX, briefFormats, correctedBrief, draftBrief, type BriefProduct, type BriefWords } from './creative-brief-model';

const S = { ...adsBriefSettings['ads.creativeBrief'].default, on: true };
const words: Record<'en' | 'bn', BriefWords> = {
  en: { hook: '{name} at {price} — {colours} colours', hookOne: '{name} at {price}', show: 'The {name} on the house background.', noText: 'No words on the picture.' },
  bn: { hook: '{name} {price} — {colours}টা রং', hookOne: '{name} {price}', show: '{name}, বাড়ির ব্যাকগ্রাউন্ডে।', noText: 'ছবিতে লেখা নয়।' },
};
const polo: BriefProduct = { id: 'p1', nameEn: 'Solid Polo', nameBn: 'সলিড পোলো', slug: 'solid polo', priceMinor: 90000, compareAtMinor: 110000, colours: [{ nameEn: 'Navy', nameBn: 'নেভি' }, { nameEn: 'Sky', nameBn: null }] };
const money = (m: number, l: 'en' | 'bn') => `${l}:${m / 100}`;
const draft = (p = polo, s = S) => draftBrief({ product: p, settings: s, words, money, pathPrefix: '/p/', currency: 'BDT', figures: null, adCampaignId: 'c1' });

describe('creative brief draft (PR 270)', () => {
  it('writes the offer, the hooks, the picture line and the landing address from the product', () => {
    const b = draft();
    expect(b).toMatchObject({ kind: 'ad', productId: 'p1', adCampaignId: 'c1', proposalId: null, priceMinor: 90000, wasMinor: 110000, optimiseFor: 'deliveredPurchase', landingPath: '/p/solid%20polo' });
    expect(b.colours).toEqual({ en: ['Navy', 'Sky'], bn: ['নেভি', 'Sky'] });
    expect(b.hooks).toEqual({ en: 'Solid Polo at en:900 — 2 colours', bn: 'সলিড পোলো bn:900 — 2টা রং' });
    expect(b.show.en).toBe('The Solid Polo on the house background. No words on the picture.');
  });

  it('keeps a compare-at price only when higher, and gives one colour its own hook', () => {
    const b = draft({ ...polo, compareAtMinor: 90000, colours: [{ nameEn: 'Navy', nameBn: null }] }, { ...S, noTextOnPicture: false });
    expect(b.wasMinor).toBeNull();
    expect(b.hooks.en).toBe('Solid Polo at en:900');
    expect(b.show.en).toBe('The Solid Polo on the house background.');
    expect(draft({ ...polo, priceMinor: null }).wasMinor).toBeNull();
  });

  it('follows the format switches and numbers', () => {
    expect(briefFormats(S)).toEqual([{ kind: 'photo', ratio: '4:5' }, { kind: 'carousel', ratio: '1:1', cards: 4 }, { kind: 'video', ratio: '9:16', minSeconds: 8, maxSeconds: 12 }]);
    expect(briefFormats({ ...S, photo: false, video: false, carouselCards: 6 })).toEqual([{ kind: 'carousel', ratio: '1:1', cards: 6 }]);
  });

  it('takes a person’s corrections trimmed and bounded, and never blank', () => {
    const b = correctedBrief(draft(), { hooks: { bn: '  দুটো পোলো  ', en: '   ' }, show: { en: 'x'.repeat(BRIEF_TEXT_MAX + 50) } });
    expect(b.hooks).toEqual({ bn: 'দুটো পোলো', en: 'Solid Polo at en:900 — 2 colours' });
    expect(b.show.en).toHaveLength(BRIEF_TEXT_MAX);
    expect(b.show.bn).toBe(draft().show.bn);
  });
});
