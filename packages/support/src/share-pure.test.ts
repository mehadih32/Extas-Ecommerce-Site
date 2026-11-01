// PR 429 — a product link and card from a chat, without a database: the link's words, its shape, the card's lines.
import { describe, expect, it } from 'vitest';
import { REF_CODE, SHARE_QUERY, shareBody, shareLink } from './pure';
import { newRefCode } from './catalogue';

describe('PR 429 · the product link from a chat (pure)', () => {
  it('builds the shop link with its colour, size and reference; without a colour or size only the reference', () => {
    expect(shareLink({ origin: 'https://shop.example.test/', prefix: '/p/', slug: 'pique polo', colour: 'navy', size: 'l', ref: 'abcd2345ef' })).toBe('https://shop.example.test/p/pique%20polo?color=navy&s=l&r=abcd2345ef');
    expect(shareLink({ origin: null, prefix: '/product', slug: 'polo', colour: null, size: null, ref: 'abcd2345ef' })).toBe('/product/polo?r=abcd2345ef');
    expect(SHARE_QUERY).toEqual({ colour: 'color', size: 's', ref: 'r' });
  });

  it('a fresh reference always has the shop’s shape; other shapes are not ours', () => {
    for (let i = 0; i < 50; i++) expect(REF_CODE.test(newRefCode())).toBe(true);
    for (const bad of ['', 'short', 'ABCDEFGHIJ', 'abc def ghi', 'a'.repeat(25), 'abcd-efgh-ij']) expect(REF_CODE.test(bad), bad).toBe(false);
  });

  it('the card: the name with the colour and size picked, the price, the link — one line each', () => {
    expect(shareBody({ name: 'Pique Polo', colour: 'Navy', size: 'L', price: '৳1,450', link: 'https://x.test/p/polo?r=abcd2345ef' })).toBe('Pique Polo (Navy · L)\n৳1,450\nhttps://x.test/p/polo?r=abcd2345ef');
    expect(shareBody({ name: 'Pique Polo', colour: null, size: null, price: '', link: '/p/polo?r=abcd2345ef' })).toBe('Pique Polo\n/p/polo?r=abcd2345ef');
  });
});
