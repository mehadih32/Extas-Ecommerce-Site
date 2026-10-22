// PR 82 / 85 — the shop's fonts swap in like the demo's (fonts/shop.css). So the first screen never re-flows when
// they arrive, the few faces it paints with are preloaded: they start downloading with the page and are in before the
// first paint (the Bengali faces keep `optional`: see shopFontPreloads). Each address
// is the same built file the stylesheet uses (`new URL(…, import.meta.url)` resolves to the hashed /_next/static path).
import { FONT_FAMILIES, type FontFamilyKey, type ThemeTokens } from './tokens';
import type { ShopLang } from './lang';

const FACES = {
  'instrument-sans': {
    400: new URL('../../fonts/instrument-sans/instrument-sans-latin-400-normal.woff2', import.meta.url),
    500: new URL('../../fonts/instrument-sans/instrument-sans-latin-500-normal.woff2', import.meta.url),
    600: new URL('../../fonts/instrument-sans/instrument-sans-latin-600-normal.woff2', import.meta.url),
    700: new URL('../../fonts/instrument-sans/instrument-sans-latin-700-normal.woff2', import.meta.url),
  },
  archivo: {
    500: new URL('../../fonts/archivo/archivo-latin-500-normal.woff2', import.meta.url),
    600: new URL('../../fonts/archivo/archivo-latin-600-normal.woff2', import.meta.url),
    700: new URL('../../fonts/archivo/archivo-latin-700-normal.woff2', import.meta.url),
    800: new URL('../../fonts/archivo/archivo-latin-800-normal.woff2', import.meta.url),
  },
  'hind-siliguri': {
    400: new URL('../../fonts/hind-siliguri/hind-siliguri-bengali-400-normal.woff2', import.meta.url),
    500: new URL('../../fonts/hind-siliguri/hind-siliguri-bengali-500-normal.woff2', import.meta.url),
    600: new URL('../../fonts/hind-siliguri/hind-siliguri-bengali-600-normal.woff2', import.meta.url),
  },
  'cormorant-garamond': {
    500: new URL('../../fonts/cormorant-garamond/cormorant-garamond-latin-500-normal.woff2', import.meta.url),
    600: new URL('../../fonts/cormorant-garamond/cormorant-garamond-latin-600-normal.woff2', import.meta.url),
    700: new URL('../../fonts/cormorant-garamond/cormorant-garamond-latin-700-normal.woff2', import.meta.url),
  },
} satisfies Record<FontFamilyKey, Record<number, URL>>;

/** The taka sign alone (PR 41), in the face a price is drawn with (bold text takes the 600 face). */
const TAKA_600 = new URL('../../fonts/hind-siliguri/hind-siliguri-taka-600-normal.woff2', import.meta.url);

/** Which self-hosted family a token's stack names (its first family). */
export function familyOf(stack: string): FontFamilyKey | null {
  const hit = (Object.keys(FONT_FAMILIES) as FontFamilyKey[]).find((k) => FONT_FAMILIES[k] === stack);
  return hit ?? null;
}

/** The face nearest to a weight that the family has (CSS font matching picks the same one). */
function face(family: FontFamilyKey, weight: number): URL {
  const faces = FACES[family] as Record<number, URL>;
  const ws = Object.keys(faces).map(Number);
  const best = ws.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  return faces[best]!;
}

function path(u: URL): string {
  // In the build the address is already the site path; in tests it is a file URL — keep only the file's path.
  return u.protocol === 'file:' ? u.pathname : `${u.pathname}${u.search}`;
}

/**
 * The faces the first screen paints with: the body text (regular and semibold), the wordmark (the display family at
 * its heaviest) and the headings (the display family at the theme's weight). ~~On a Bengali page, also the Bengali
 * text.~~ The Bengali faces are 70 KB each: preloading them held back the stylesheet (first paint 0.8 s later on a
 * slow line), so they load as `optional` faces when the text needs them (`lang` stays for a lighter Bengali subset).
 */
export function shopFontPreloads(tokens: ThemeTokens, lang: ShopLang): string[] {
  const body = familyOf(tokens['font-body']) ?? 'instrument-sans';
  const display = familyOf(tokens['font-display']) ?? 'archivo';
  const weight = Number.parseInt(tokens['display-weight'], 10) || 700;
  // PR 41: the taka sign of every price (2.5 KB, the price weight's face; fonts/shop.css)
  const urls = [face(body, 400), face(body, 600), face('archivo', 800), face(display, weight), TAKA_600];
  void lang;
  return [...new Set(urls.map(path))];
}
