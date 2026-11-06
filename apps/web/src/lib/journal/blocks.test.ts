// S12 · PR 240 — the article's writing format as blocks (the editor's preview and the shop draw the same).
import { describe, expect, it } from 'vitest';
import { blocks, contents, inline, safeHref } from './blocks';

describe('article blocks (PR 240)', () => {
  it('reads headings, paragraphs, lists, boxes and one product block', () => {
    const b = blocks('## Wash cold\nTurn it\ninside out.\n\n- one\n- two\n1. first\n> tip: Dry flat.\n[products]\n[products]\n### Small\n## Wash cold');
    expect(b.map((x) => x.t)).toEqual(['h2', 'p', 'ul', 'ol', 'box', 'products', 'h3', 'h2']);
    expect(b[1]).toEqual({ t: 'p', s: [{ t: 'text', s: 'Turn it inside out.' }] });
    expect(b[2]).toMatchObject({ items: [[{ s: 'one' }], [{ s: 'two' }]] });
    expect(contents(b).map((c) => c.id)).toEqual(['wash-cold', 'wash-cold-7']);
    expect(contents(blocks('## পোলোর যত্ন'))).toEqual([{ id: 'part-0', s: 'পোলোর যত্ন' }]);
  });

  it('keeps bold and safe links, and turns an unsafe link into plain words', () => {
    expect(inline('Read **this** and [the polos](/collections/polos) or [x](javascript:alert(1))')).toEqual([
      { t: 'text', s: 'Read ' },
      { t: 'b', s: 'this' },
      { t: 'text', s: ' and ' },
      { t: 'a', s: 'the polos', href: '/collections/polos' },
      { t: 'text', s: ' or ' },
      { t: 'text', s: 'x' },
      { t: 'text', s: ')' },
    ]);
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('http://example.com')).toBeNull();
    expect(safeHref('//evil.example')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
  });
});
