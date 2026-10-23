import { existsSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bengaliFontFaces, bengaliFontUrls, familyOf, shopDefaultFontPreloads, shopFontPreloads, shopThemeFontPreloads } from './font-preload';
import { FONT_FAMILIES, THEMES } from './tokens';

describe('shop font preloads (PR 82 / 85)', () => {
  it('names the body, wordmark and heading faces of the classic theme, and nothing else', () => {
    const urls = shopFontPreloads(THEMES.classic, 'en');
    // follow-up 23: one variable file per family carries every weight, so one preload each
    expect(urls.map((u) => u.split('/').pop())).toEqual([
      'instrument-sans-latin-wght-normal.woff2',
      'archivo-latin-wght-normal.woff2',
      // PR 41: the taka sign of every price, 2.5 KB per face (bold prices and plain ones)
      'hind-siliguri-taka-600-normal.woff2',
      'hind-siliguri-taka-400-normal.woff2',
    ]);
  });

  it('keeps the first screen to a handful of small files (follow-up 23: late faces re-lay the page out)', () => {
    for (const t of Object.values(THEMES)) {
      const urls = shopFontPreloads(t, 'bn');
      expect(urls.length).toBeLessThanOrEqual(5);
      const bytes = urls.reduce((n, u) => n + statSync(u).size, 0);
      expect(bytes).toBeLessThan(100_000); // hardcode-ok: test budget for the preloaded font bytes
    }
  });

  it('never preloads the heavy Bengali faces (they would hold back the stylesheet)', () => {
    const urls = shopFontPreloads(THEMES.classic, 'bn').map((u) => u.split('/').pop());
    expect(urls.some((u) => u?.startsWith('hind-siliguri-bengali-'))).toBe(false);
    // only the taka sign's own tiny face (PR 41)
    expect(urls.filter((u) => u?.startsWith('hind-siliguri-'))).toEqual([
      'hind-siliguri-taka-600-normal.woff2',
      'hind-siliguri-taka-400-normal.woff2',
    ]);
  });

  it('the Bengali faces are the small cut (follow-up 23: Bengali block, no hinting)', () => {
    const dir = new URL('../../fonts/hind-siliguri/', import.meta.url);
    for (const w of [400, 500, 600]) {
      const size = statSync(new URL(`hind-siliguri-bengali-${w}-normal.woff2`, dir)).size;
      expect(size).toBeLessThan(45_000); // hardcode-ok: test budget, the hinted files were 71 KB
    }
  });

  it('follows a theme whose headings use another family', () => {
    const urls = shopFontPreloads(THEMES.ivory, 'en').map((u) => u.split('/').pop());
    expect(urls.some((u) => u?.startsWith('cormorant-garamond-latin-'))).toBe(true);
  });

  it('every preloaded file exists, and every family is known', () => {
    for (const t of Object.values(THEMES)) for (const lang of ['en', 'bn'] as const) for (const u of shopFontPreloads(t, lang)) expect(existsSync(u)).toBe(true);
    for (const k of Object.keys(FONT_FAMILIES)) expect(familyOf(FONT_FAMILIES[k as keyof typeof FONT_FAMILIES])).toBe(k);
  });

  it("the root layout preloads the shop's own faces; the wrapper adds only what a theme brings (follow-up 23)", () => {
    expect(shopDefaultFontPreloads()).toEqual(shopFontPreloads(THEMES.classic, 'en'));
    expect(shopThemeFontPreloads(THEMES.classic, 'bn')).toEqual([]);
    const ivory = shopThemeFontPreloads(THEMES.ivory, 'en').map((u) => u.split('/').pop());
    expect(ivory.length).toBeGreaterThan(0);
    expect(ivory.every((u) => u?.startsWith('cormorant-garamond-latin-'))).toBe(true);
  });

  it('declares the Bengali faces only as CSS for a browser that has them, without the taka sign (follow-up 23)', () => {
    const urls = bengaliFontUrls();
    expect(urls.map((u) => u.split('/').pop())).toEqual([
      'hind-siliguri-bengali-400-normal.woff2',
      'hind-siliguri-bengali-500-normal.woff2',
      'hind-siliguri-bengali-600-normal.woff2',
    ]);
    for (const u of urls) expect(existsSync(u)).toBe(true);
    const css = bengaliFontFaces();
    expect(css.match(/@font-face/g)).toHaveLength(3);
    expect(css).toContain("font-family:'Hind Siliguri Shop'");
    expect(css).toContain('font-display:optional');
    expect(css).not.toMatch(/U\+09F3|09F3/);
  });
});
