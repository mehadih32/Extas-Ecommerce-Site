// PR 605 follow-up 214 — the gift card on the order screen: none for an ordinary order; for a gift every row in both
// admin languages (from, the sender's contact, the note, deliver on or after or as soon as it can, prices hidden or
// shown on the receiver's invoice). Sample values only.
import { describe, expect, it } from 'vitest';
import { adminDicts } from '../admin-i18n';
import type { AdminView } from '../admin-page';
import { giftRows } from './gift-card';

const view = (lang: 'en' | 'bn'): AdminView => ({ lang, dict: adminDicts[lang], locale: lang, timeZone: 'Asia/Dhaka', storeName: null });
const GIFT = { senderName: 'Sample sender', senderContact: 'sender@example.com', note: 'Happy Eid', deliverAfter: '2026-11-20', hidePrices: true };

describe('follow-up 214 · the gift on the order screen', () => {
  it('no card for an ordinary order', () => {
    expect(giftRows(view('en'), null)).toBeNull();
  });

  it('every row in both languages, with the day and the invoice rule', () => {
    for (const lang of ['en', 'bn'] as const) {
      const rows = giftRows(view(lang), GIFT)!;
      expect(rows).toHaveLength(5);
      for (const r of rows) expect(`${r.label} ${r.value}`, lang).not.toMatch(/orders\.|\{[a-z]+\}/);
      expect(rows[0]).toMatchObject({ value: 'Sample sender', strong: true });
      expect(rows[3]!.value).toMatch(/20/);
    }
    const en = giftRows(view('en'), { ...GIFT, deliverAfter: null, hidePrices: false, note: null })!;
    expect(en[3]!.value).toBe('as soon as it can');
    expect(en[4]!.value).toBe('prices shown');
    expect(giftRows(view('en'), GIFT)![4]!.value).toBe('prices hidden');
  });
});
