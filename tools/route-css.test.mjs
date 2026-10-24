// PR 573 (follow-up 358) — a route's own cut of the big shared stylesheets (tools/route-css.mjs).
import { describe, expect, it } from 'vitest';
import { blocksOf, classWordsOf, cut, cutsNow, neededClasses, possible, selectorParts, stringsOf } from './route-css.mjs';

const vocab = (words, prefixes = []) => ({ words: new Set(words), prefixes: new Set(prefixes) });

describe('route css', () => {
  it('reads the strings of a source, template parts and class prefixes, never comments', () => {
    const src = "// a 'comment' word\nconst a = 'size-pill on'; /* \"no\" */ const b = `cb-${k} chip ${x ? 'out' : ''}`; const c = 'pm-' + y;";
    const { strings, prefixes } = stringsOf(src);
    expect(strings).toEqual(expect.arrayContaining(['size-pill on', 'cb-', ' chip ', 'out', '']));
    expect(strings).not.toContain('comment');
    expect(strings).not.toContain('no');
    expect([...prefixes].sort()).toEqual(['cb-', 'pm-']);
  });

  it('takes class words from strings, but not from CSS selector strings', () => {
    const v = classWordsOf("x('.pdp-page .size-pill::after'); y(\"btn btn-primary\"); z('a{b:c}');");
    expect(v.words.has('btn-primary')).toBe(true);
    expect(v.words.has('pdp-page')).toBe(false);
  });

  it('splits selectors at top-level commas and leaves :not() classes out of what a selector needs', () => {
    expect(selectorParts('.a, .b:is(.c, .d), .e')).toEqual(['.a', '.b:is(.c, .d)', '.e']);
    expect(neededClasses('.shop .swatch:not(.sm)::after')).toEqual(['shop', 'swatch']);
    expect(neededClasses('.shop a[href=".x"]')).toEqual(['shop']);
    expect(possible('.shop .cb-big', vocab(['shop'], ['cb-']))).toBe(true);
    expect(possible('.shop .pdp-page .x', vocab(['shop', 'x']))).toBe(false);
  });

  it('keeps the usable rules in order, the media blocks that hold one, and only the keyframes a kept rule names', () => {
    const css = [
      '/* head */ .shop .a { color: red; }',
      '.shop .pdp-page .b { color: blue; }',
      '@keyframes spin { to { transform: rotate(1turn); } }',
      '@keyframes unused { to { opacity: 0; } }',
      '@media (min-width: 1024px) { .shop .pdp-page .c { top: 0; } .shop .a, .shop .pdp-page .d { animation: spin 1s; } }',
      '@media (max-width: 1023px) { .shop .pdp-page .e { top: 0; } }',
    ].join('\n');
    const out = cut(css, vocab(['shop', 'a']));
    expect(out).toContain('.shop .a { color: red; }');
    expect(out).not.toContain('pdp-page');
    expect(out).toContain('@media (min-width: 1024px) {\n  .shop .a { animation: spin 1s; }\n}');
    expect(out).not.toContain('max-width');
    expect(out).toContain('@keyframes spin');
    expect(out).not.toContain('unused');
    expect(blocksOf(css).length).toBe(6);
  });

  it('every committed cut is current with its sources and its route (run node tools/route-css.mjs)', () => {
    for (const c of cutsNow()) {
      expect(c.have, c.out).toBe(c.want);
      // the cut is a real saving: the combo route never draws the product page's own rules
      expect(c.want).not.toMatch(/\.pdp-page\b/);
    }
  });
});
