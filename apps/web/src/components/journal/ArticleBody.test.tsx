// S12 · PR 592 — what the shop puts after the n-th paragraph (a house ad) lands right after that paragraph, never
// before the first, and an article without the hook draws exactly as before.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ArticleBody } from './ArticleBody';

const body = 'First words.\n\n## A heading\n\nSecond words.\n\n- a list item\n\nThird words.';
const words = { tip: 'Tip:', note: 'Note:' };

describe('ArticleBody after paragraph N (PR 592)', () => {
  it('puts the extra right after the n-th paragraph, counting paragraphs only', () => {
    const html = renderToStaticMarkup(<ArticleBody body={body} boxWords={words} afterParagraph={(n) => (n === 2 ? <aside data-ad="2" /> : null)} />);
    expect(html).toMatch(/<p>Second words\.<\/p><aside data-ad="2"><\/aside>/);
    expect(html.indexOf('data-ad')).toBeGreaterThan(html.indexOf('First words.'));
  });

  it('without the hook the words are drawn as before', () => {
    const html = renderToStaticMarkup(<ArticleBody body={body} boxWords={words} />);
    expect(html).not.toContain('data-ad');
    expect(html.match(/<p>/g)).toHaveLength(3);
  });
});
