// S12 · PR 529 — reading a source page's own facts, pure: title, description, headings and body text, and what an
// empty or odd page gives back.
import { describe, expect, it } from 'vitest';
import { HEADINGS_MAX, parseSourcePage, sourceLinkInput } from './source-link-model';

const page = (body: string, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

describe('parseSourcePage (PR 529)', () => {
  it('reads the title, description and the h2/h3 outline, in order and deduplicated', () => {
    const html = page(
      '<h1>Not an outline heading</h1><h2>Why cotton breathes</h2><h3>Washing it right</h3><h2>Why cotton breathes</h2><p>Some research text about cotton and how it breathes in humid weather.</p>',
      '<title>Cotton 101 | Sample Brand</title><meta name="description" content="A short primer on cotton.">',
    );
    const facts = parseSourcePage(html, 'https://example.com/cotton-101');
    expect(facts).toMatchObject({ url: 'https://example.com/cotton-101', title: 'Cotton 101 | Sample Brand', description: 'A short primer on cotton.', headings: ['Why cotton breathes', 'Washing it right'] });
    expect(facts.bodyText).toContain('Some research text about cotton');
  });

  it('prefers og:title and og:description over the <title> tag and the plain description meta', () => {
    const html = page('<p>text</p>', '<title>Fallback title</title><meta property="og:title" content="Og title wins"><meta property="og:description" content="Og description wins"><meta name="description" content="not this one">');
    const facts = parseSourcePage(html, 'https://example.com/x');
    expect(facts.title).toBe('Og title wins');
    expect(facts.description).toBe('Og description wins');
  });

  it('cuts the outline at HEADINGS_MAX and never includes an empty heading', () => {
    const heads = Array.from({ length: HEADINGS_MAX + 5 }, (_, i) => `<h2>Point ${i}</h2>`).join('') + '<h3></h3><h3>   </h3>';
    const facts = parseSourcePage(page(heads), 'https://example.com/x');
    expect(facts.headings).toHaveLength(HEADINGS_MAX);
    expect(facts.headings[0]).toBe('Point 0');
  });

  it('gives an empty title and body for a page with nothing readable', () => {
    const facts = parseSourcePage(page(''), 'https://example.com/blank');
    expect(facts).toMatchObject({ title: null, description: null, headings: [], bodyText: '' });
  });

  it('strips tags and collapses whitespace in headings and the one-line fields', () => {
    const html = page('<h2>Why  <b>cotton</b>\n breathes</h2>', '<title>  Spaced   <i>Title</i>  </title>');
    const facts = parseSourcePage(html, 'https://example.com/x');
    expect(facts.title).toBe('Spaced Title');
    expect(facts.headings).toEqual(['Why cotton breathes']);
  });
});

describe('sourceLinkInput (PR 529)', () => {
  const base = { url: 'https://example.com/a', locale: 'en' as const };

  it('needs a url and a locale of en or bn; wordCount is optional and bounded', () => {
    expect(sourceLinkInput.safeParse(base).success).toBe(true);
    expect(sourceLinkInput.safeParse({ ...base, wordCount: 900 }).success).toBe(true);
    expect(sourceLinkInput.safeParse({ ...base, locale: 'fr' }).success).toBe(false);
    expect(sourceLinkInput.safeParse({ url: '' }).success).toBe(false);
    expect(sourceLinkInput.safeParse({ ...base, wordCount: 99 }).success).toBe(false);
    expect(sourceLinkInput.safeParse({ ...base, wordCount: 10_001 }).success).toBe(false);
  });

  it('refuses an unknown field', () => {
    expect(sourceLinkInput.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
