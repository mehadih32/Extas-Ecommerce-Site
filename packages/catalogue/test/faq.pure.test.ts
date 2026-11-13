// S28 · PR 682 — which questions a product page shows.
import { describe, expect, it } from 'vitest';
import { pickFaqs, type FaqPickRow } from '../src/faq-pick';

const row = (scope: FaqPickRow['scope'], q: string, o: Partial<FaqPickRow> = {}): FaqPickRow => ({
  scope,
  questionEn: q,
  questionBn: null,
  answerEn: `A ${q}`,
  answerBn: null,
  sortOrder: 0,
  createdAt: new Date('2026-11-01'),
  ...o,
});

describe('pickFaqs', () => {
  it('puts the product first, then its category, then the shop, each by its order', () => {
    const r = [row('SHOP', 's1'), row('CATEGORY', 'c2', { sortOrder: 2 }), row('PRODUCT', 'p1'), row('CATEGORY', 'c1', { sortOrder: 1 })];
    expect(pickFaqs(r, { lang: 'en', includeShop: true, max: 10 }).map((x) => x.question)).toEqual(['p1', 'c1', 'c2', 's1']);
  });
  it('leaves out the shop-wide ones when asked, and stops at the most', () => {
    const r = [row('SHOP', 's1'), row('PRODUCT', 'p1'), row('PRODUCT', 'p2')];
    expect(pickFaqs(r, { lang: 'en', includeShop: false, max: 10 }).map((x) => x.question)).toEqual(['p1', 'p2']);
    expect(pickFaqs(r, { lang: 'en', includeShop: true, max: 2 })).toHaveLength(2);
  });
  it('shows a question once even when it is on the product and in its category', () => {
    const r = [row('CATEGORY', 'Is it pre-shrunk?'), row('PRODUCT', 'is it pre-shrunk? ')];
    const out = pickFaqs(r, { lang: 'en', includeShop: true, max: 10 });
    expect(out).toHaveLength(1);
    expect(out[0]!.scope).toBe('PRODUCT');
  });
  it('uses Bengali words when they are there, else the English', () => {
    const r = [row('PRODUCT', 'q1', { questionBn: 'প্রশ্ন', answerBn: 'উত্তর' }), row('PRODUCT', 'q2')];
    expect(pickFaqs(r, { lang: 'bn', includeShop: true, max: 10 }).map((x) => x.question)).toEqual(['প্রশ্ন', 'q2']);
    expect(pickFaqs(r, { lang: 'en', includeShop: true, max: 10 })[0]!.answer).toBe('A q1');
  });
});
