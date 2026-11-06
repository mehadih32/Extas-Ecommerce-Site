// S02 · PR 80 follow-up 679 — "Send my bag on WhatsApp": the message lists every line with its colour, size,
// quantity and amount, each set with its pieces, and the total (free delivery said only when it is free); words from
// the shop dictionary in the page's language.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./catalogue', () => ({
  productName: (p: { nameEn: string; nameBn: string | null }, lang: string) => (lang === 'bn' && p.nameBn) || p.nameEn,
  colourName: (c: { nameEn: string; nameBn: string | null }, lang: string) => (lang === 'bn' && c.nameBn) || c.nameEn,
}));
const { bagWaMessage } = await import('./bag-wa');
const { shopT } = await import('./dict');

const colour = (nameEn: string, nameBn: string | null = null) => ({
  id: nameEn,
  key: nameEn,
  hex: '#000000',
  nameEn,
  nameBn,
});
const view = (free = false) =>
  ({
    items: [
      {
        nameEn: 'Sample polo',
        nameBn: 'নমুনা পোলো',
        colour: colour('Olive', 'জলপাই'),
        size: { id: 's', label: 'M' },
        quantity: 2,
        lineMinor: 240000,
      },
    ],
    sets: [
      {
        nameEn: 'Sample duo',
        nameBn: null,
        payMinor: 150000,
        pieces: [
          {
            nameEn: 'Shirt A',
            nameBn: null,
            colour: colour('White'),
            size: 'L',
          },
          { nameEn: 'Shirt B', nameBn: null, colour: null, size: null },
        ],
      },
    ],
    summary: { totalMinor: 390000, freeDelivery: free },
  }) as never;
const w = (lang: 'en' | 'bn') => ({
  t: shopT(lang),
  money: (m: number) => `Tk ${m / 100}`,
  num: (n: number) => String(n),
  lang,
  store: 'Sample shop',
});

describe('bagWaMessage (follow-up 679)', () => {
  it('every line, every set piece and the total, in English', () => {
    const msg = bagWaMessage(view(), w('en')).split('\n');
    expect(msg[0]).toBe('Hi Sample shop, I would like to order:');
    expect(msg).toContain('1. Sample duo — Tk 1500');
    expect(msg).toContain('    • Shirt A — White, L');
    expect(msg).toContain('    • Shirt B');
    expect(msg).toContain('2. Sample polo — Olive, M × 2 — Tk 2400');
    expect(msg).toContain('Bag total: Tk 3900 (delivery as per my address)');
    expect(msg.at(-1)).toBe('Please place this order for me.');
  });
  it('free delivery is said only when the bag has it; Bengali names and words on a Bengali page', () => {
    expect(bagWaMessage(view(true), w('en'))).toContain('(free delivery)');
    const bn = bagWaMessage(view(true), w('bn'));
    expect(bn).toContain('নমুনা পোলো — জলপাই, M × 2');
    expect(bn).toContain('ফ্রি ডেলিভারি');
  });
});
