import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { familyOf, shopFontPreloads } from './font-preload';
import { FONT_FAMILIES, THEMES } from './tokens';

describe('shop font preloads (PR 82 / 85)', () => {
  it('names the body, wordmark and heading faces of the classic theme, and nothing else', () => {
    const urls = shopFontPreloads(THEMES.classic, 'en');
    expect(urls.map((u) => u.split('/').pop())).toEqual([
      'instrument-sans-latin-400-normal.woff2',
      'instrument-sans-latin-600-normal.woff2',
      'archivo-latin-800-normal.woff2',
      // PR 41: the taka sign of every price, 2.5 KB
      'hind-siliguri-taka-600-normal.woff2',
    ]);
  });

  it('never preloads the heavy Bengali faces (they would hold back the stylesheet)', () => {
    const urls = shopFontPreloads(THEMES.classic, 'bn').map((u) => u.split('/').pop());
    expect(urls.some((u) => u?.startsWith('hind-siliguri-bengali-'))).toBe(false);
    // only the taka sign's own tiny face (PR 41)
    expect(urls.filter((u) => u?.startsWith('hind-siliguri-'))).toEqual(['hind-siliguri-taka-600-normal.woff2']);
  });

  it('follows a theme whose headings use another family', () => {
    const urls = shopFontPreloads(THEMES.ivory, 'en').map((u) => u.split('/').pop());
    expect(urls.some((u) => u?.startsWith('cormorant-garamond-latin-'))).toBe(true);
  });

  it('every preloaded file exists, and every family is known', () => {
    for (const t of Object.values(THEMES)) for (const lang of ['en', 'bn'] as const) for (const u of shopFontPreloads(t, lang)) expect(existsSync(u)).toBe(true);
    for (const k of Object.keys(FONT_FAMILIES)) expect(familyOf(FONT_FAMILIES[k as keyof typeof FONT_FAMILIES])).toBe(k);
  });
});
