// S28 · PR 682 — the product page's FAQ list and its markup read one rule; off (as shipped) shows nothing.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { pickFaqs } from '@extas/catalogue';
import { faqLd } from './structured-data';

const def = registry['catalogue.faq'].default;
const row = (scope: 'PRODUCT' | 'CATEGORY' | 'SHOP', q: string) => ({
  scope,
  questionEn: q,
  questionBn: null,
  answerEn: `A ${q}`,
  answerBn: null,
  sortOrder: 0,
  createdAt: new Date('2026-11-01'),
});

describe('catalogue.faq', () => {
  it('ships off, with the shop-wide questions included and a limit of 12', () => {
    expect(def).toMatchObject({ on: false, includeShop: true, max: 12, markup: true });
  });
  it('feeds the same list to the page and to the FAQPage markup', () => {
    const items = pickFaqs([row('SHOP', 'Delivery time?'), row('PRODUCT', 'Pre-shrunk?')], { lang: 'en', includeShop: true, max: 12 });
    const ld = faqLd(
      new URL('https://shop.example'),
      '/p/polo',
      items.map((f) => ({ question: f.question, answer: f.answer })),
    );
    expect(ld).toMatchObject({ '@type': 'FAQPage', url: 'https://shop.example/p/polo' });
    expect((ld!.mainEntity as { name: string }[]).map((x) => x.name)).toEqual(['Pre-shrunk?', 'Delivery time?']);
    expect(faqLd('https://shop.example', '/p/polo', [])).toBeNull();
  });
});
