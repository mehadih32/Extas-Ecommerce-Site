// Follow-up 35 — the JSON-LD says only what the page shows: the trail and the grid's products.
import { describe, expect, it } from 'vitest';
import { breadcrumbLd, itemListLd, ldJson } from './structured-data';

const origin = new URL('https://shop.example.test');

describe('structured data', () => {
  it('the trail is absolute, in order, and needs at least two steps', () => {
    const ld = breadcrumbLd(origin, [
      { name: 'Home', href: '/bn' },
      { name: 'Polos', href: '/bn/collections/polos' },
    ]);
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://shop.example.test/bn' },
        { '@type': 'ListItem', position: 2, name: 'Polos', item: 'https://shop.example.test/bn/collections/polos' },
      ],
    });
    expect(breadcrumbLd(origin, [{ name: 'Home', href: '/' }])).toBeNull();
  });

  it('the list holds the products the grid shows, and nothing for an empty grid', () => {
    const ld = itemListLd(origin, 'Polos', [{ name: 'A', href: '/p/a' }]);
    expect(ld?.numberOfItems).toBe(1);
    expect(ld?.itemListElement).toEqual([{ '@type': 'ListItem', position: 1, url: 'https://shop.example.test/p/a', name: 'A' }]);
    expect(itemListLd(origin, 'Polos', [])).toBeNull();
  });

  it('a name cannot end the script', () => {
    expect(ldJson({ name: '</script><b>' })).toBe('{"name":"\\u003c/script>\\u003cb>"}');
  });
});
