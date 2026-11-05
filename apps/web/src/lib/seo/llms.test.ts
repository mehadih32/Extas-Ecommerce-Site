// S11 · PR 230 — /llms.txt says only what the shop shows: the name, the owner's summary, collections, rules pages and
// the contact details filled in; an empty field is left out, never invented.
import { describe, expect, it } from 'vitest';
import { llmsTxt, LLMS_PAGE_LINES, type LlmsFacts } from './llms';

const base: LlmsFacts = {
  name: 'Sample store',
  origin: 'https://shop.example.test',
  summary: '',
  currency: 'BDT',
  bengali: false,
  collections: [],
  pages: [],
  contact: { phone: null, whatsapp: null, email: null, hours: null, address: null },
};

describe('PR 230 · llms.txt', () => {
  it('a bare shop: only its name and address; no summary, no empty sections', () => {
    expect(llmsTxt(base)).toBe('# Sample store\n\nOnline shop: https://shop.example.test/. Prices in BDT.\n');
  });

  it('the summary, collections with their lines, rules pages and the filled-in contact, as absolute links', () => {
    const txt = llmsTxt({
      ...base,
      summary: 'Sample menswear\nfrom Dhaka.',
      bengali: true,
      collections: [{ name: 'Polos', href: '/collections/polos', line: 'Sample line [x]', children: [{ name: 'Pique', href: '/collections/pique' }] }],
      pages: [
        { title: 'Delivery', href: '/help/delivery', lines: ['Inside Dhaka in 2 days', ''] },
        { title: 'Questions', href: '/help/faq', lines: Array.from({ length: 12 }, (_, i) => `Q${i}?`) },
      ],
      contact: { phone: '+8801000000000', whatsapp: null, email: 'shop@example.test', hours: null, address: null },
    });
    expect(txt).toContain('> Sample menswear from Dhaka.');
    expect(txt).toContain('Also in Bengali: https://shop.example.test/bn.');
    expect(txt).toContain('- [Polos](https://shop.example.test/collections/polos): Sample line x');
    expect(txt).toContain('  - [Pique](https://shop.example.test/collections/pique)');
    expect(txt).toContain('- [Delivery](https://shop.example.test/help/delivery): Inside Dhaka in 2 days\n');
    expect(txt.match(/Q\d+\?/g)).toHaveLength(LLMS_PAGE_LINES);
    expect(txt).toContain('## Contact\n\n- Phone: +8801000000000\n- E-mail: shop@example.test\n');
    expect(txt).not.toContain('WhatsApp');
  });
});
