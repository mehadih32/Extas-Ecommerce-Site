// S11 · PR 221 — a page's search title and description: its own text first (never cut), then its kind's template with
// the page's tokens (cut to the store's limit at a word), then — for a description — its body words; an empty template
// leaves nothing made up.
import { describe, expect, it } from 'vitest';
import { SEO_TITLES_DEFAULT } from '@extas/settings';
import { cutBody, pageTexts, templateOf } from './templates';

const max = { title: 60, description: 155 };

describe('search titles and descriptions (PR 221)', () => {
  it('fills the kind’s template from the page', () => {
    const t = pageTexts({ template: templateOf(SEO_TITLES_DEFAULT, 'category', 'en'), tokens: { name: 'Polos', count: '12 styles', intro: 'Pique and jersey.', shop: 'Sample Shop' }, max });
    expect(t).toEqual({ title: 'Polos · Sample Shop', description: 'Polos: 12 styles. Pique and jersey.' });
    const bn = pageTexts({ template: templateOf(SEO_TITLES_DEFAULT, 'category', 'bn'), tokens: { name: 'পোলো', count: '১২টি স্টাইল', intro: '', shop: 'Sample Shop' }, max });
    expect(bn).toEqual({ title: 'পোলো · Sample Shop', description: 'পোলো: ১২টি স্টাইল।' });
  });

  it('the home page is the shop’s name, with no description until the owner writes one', () => {
    expect(pageTexts({ template: templateOf(SEO_TITLES_DEFAULT, 'home', 'en'), tokens: { shop: 'Sample Shop' }, max })).toEqual({ title: 'Sample Shop', description: null });
    // no shop name at all: no title made from nothing (the page keeps its plain one)
    expect(pageTexts({ template: templateOf(SEO_TITLES_DEFAULT, 'home', 'en'), tokens: { shop: '' }, max }).title).toBeNull();
  });

  it('own text comes first and is never cut; a template’s is cut to the limit', () => {
    const long = 'A very long own title the owner typed on purpose for this category page of the shop';
    const t = pageTexts({ own: { title: long, description: 'Own words.' }, template: { title: '{name} · {shop}', description: '{name}' }, tokens: { name: 'X', shop: 'S' }, max });
    expect(t).toEqual({ title: long, description: 'Own words.' });
    const cut = pageTexts({ template: { title: '{name} · {shop}', description: '' }, tokens: { name: long, shop: 'S' }, max: { title: 30, description: 155 } });
    expect([...(cut.title ?? '')].length).toBeLessThanOrEqual(30);
    expect(cut.title).toBe('A very long own title the');
  });

  it('a description from the body only when nothing else gives one, cut with an ellipsis', () => {
    const body = 'Soft pique cotton,\n\nwith a ribbed collar. '.repeat(10);
    const t = pageTexts({ template: { title: '{name}', description: '' }, tokens: { name: 'Polo' }, max, body });
    expect(t.description?.endsWith('…')).toBe(true);
    expect([...(t.description ?? '')].length).toBeLessThanOrEqual(155);
    expect(t.description).not.toContain('\n');
    expect(cutBody('Short body.', 155)).toBe('Short body.');
    // a template description wins over the body
    expect(pageTexts({ template: { title: '{name}', description: '{name} at {shop}.' }, tokens: { name: 'Polo', shop: 'S' }, max, body }).description).toBe('Polo at S.');
  });
});
