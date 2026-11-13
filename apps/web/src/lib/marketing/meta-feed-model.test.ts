// S28 · PR 696 — the Meta feed: Meta's words for availability, a title cut at Meta's limit, escaping, and the issue list.
import { describe, expect, it } from 'vitest';
import { metaAvailability, metaFeedXml, metaIssues } from './meta-feed-model';
import type { FeedItem, FeedProduct } from './merchant-feed-model';

const product = (o: Partial<FeedProduct> = {}): FeedProduct => ({ id: 'p1', title: 'Sample polo', description: 'A soft cotton polo for everyday wear.', link: 'https://shop.example.test/p/polo', image: 'https://shop.example.test/i.jpg', priceMinor: 150000, wasMinor: null, inStock: true, brand: 'Sample', category: 'Polo', ...o });
const item = (o: Partial<FeedItem> = {}): FeedItem => ({ id: 'p1', title: 'Sample polo & tee', description: 'Soft <b>cotton</b>.', link: 'https://shop.example.test/p/polo', image: 'https://shop.example.test/i.jpg', availability: 'in_stock', price: '1500.00 BDT', salePrice: null, brand: 'Sample', productType: 'Polo', groupId: null, colour: null, size: null, gender: null, ageGroup: null, ...o });

describe('Meta feed (PR 696)', () => {
  it('writes availability the way Meta reads it', () => {
    expect(metaAvailability('in_stock')).toBe('in stock');
    expect(metaAvailability('out_of_stock')).toBe('out of stock');
  });
  it('writes the RSS file with escaped text and no Google shipping block', () => {
    const xml = metaFeedXml({ title: 'Sample & Co', link: 'https://shop.example.test/' }, [item(), item({ id: 'p2', availability: 'out_of_stock', salePrice: '1200.00 BDT', colour: 'Navy', size: 'L', groupId: 'p1' })]);
    expect(xml).toContain('<g:availability>in stock</g:availability>');
    expect(xml).toContain('<g:availability>out of stock</g:availability>');
    expect(xml).toContain('<title>Sample &amp; Co</title>');
    expect(xml).toContain('<g:title>Sample polo &amp; tee</g:title>');
    expect(xml).toContain('<g:item_group_id>p1</g:item_group_id>');
    expect(xml).not.toContain('g:shipping');
  });
  it('cuts a title at Meta\'s limit', () => {
    const xml = metaFeedXml({ title: 't', link: 'l' }, [item({ title: 'x'.repeat(260) })]);
    expect(xml).toContain(`<g:title>${'x'.repeat(200)}</g:title>`);
  });
  it('lists only products with a reason or an issue, with both kinds kept apart', () => {
    const list = metaIssues(
      [
        product(),
        product({ id: 'p2', image: null }),
        product({ id: 'p3', title: 'y'.repeat(80) }),
        product({ id: 'p4', title: 'z'.repeat(250), description: 'Soft.' }),
        product({ id: 'p5', inStock: false }),
        product({ id: 'p6', brand: ' ' }),
      ],
      false,
    );
    expect(list.map((x) => x.id)).toEqual(['p2', 'p3', 'p4', 'p5', 'p6']);
    expect(list.find((x) => x.id === 'p2')).toMatchObject({ left: ['noImage'], issues: [] });
    expect(list.find((x) => x.id === 'p3')).toMatchObject({ left: [], issues: ['titleLong'] });
    expect(list.find((x) => x.id === 'p4')?.issues).toEqual(['titleTooLong', 'descriptionShort']);
    expect(list.find((x) => x.id === 'p5')?.left).toEqual(['soldOut']);
    expect(list.find((x) => x.id === 'p6')?.issues).toEqual(['noBrand']);
    // sold-out products stay in when the Google card keeps them
    expect(metaIssues([product({ id: 'p5', inStock: false })], true)).toEqual([]);
  });
});
