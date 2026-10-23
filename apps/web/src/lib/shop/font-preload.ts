// PR 82 / 85 — the shop's fonts swap in like the demo's (fonts/shop.css). So the first screen never re-flows when
// they arrive, the few faces it paints with are preloaded: they start downloading with the page and are in before the
// first paint (the Bengali faces keep `optional`, and since follow-up 23 are declared only once cached: see the end of
// this file). Each address is the same built file the stylesheet uses (`new URL(…, import.meta.url)` resolves to the
// hashed /_next/static path).
import { FONT_FAMILIES, THEMES, type FontFamilyKey, type ThemeTokens } from './tokens';
import type { ShopLang } from './lang';

// Follow-up 23: Instrument Sans and Archivo are one variable file each (every weight in one file; fonts/shop.css).
// ~~One static file per weight (400, 500, 600, 700 / 500, 600, 700, 800).~~
const INSTRUMENT = new URL('../../fonts/instrument-sans/instrument-sans-latin-wght-normal.woff2', import.meta.url);
const ARCHIVO = new URL('../../fonts/archivo/archivo-latin-wght-normal.woff2', import.meta.url);

const FACES = {
  'instrument-sans': { 400: INSTRUMENT, 500: INSTRUMENT, 600: INSTRUMENT, 700: INSTRUMENT },
  archivo: { 500: ARCHIVO, 600: ARCHIVO, 700: ARCHIVO, 800: ARCHIVO },
  // The Latin letters of a Hind Siliguri theme (~~the Bengali files~~: those load only once cached, see below)
  'hind-siliguri': {
    400: new URL('../../fonts/hind-siliguri/hind-siliguri-latin-400-normal.woff2', import.meta.url),
    500: new URL('../../fonts/hind-siliguri/hind-siliguri-latin-500-normal.woff2', import.meta.url),
    600: new URL('../../fonts/hind-siliguri/hind-siliguri-latin-600-normal.woff2', import.meta.url),
  },
  'cormorant-garamond': {
    500: new URL('../../fonts/cormorant-garamond/cormorant-garamond-latin-500-normal.woff2', import.meta.url),
    600: new URL('../../fonts/cormorant-garamond/cormorant-garamond-latin-600-normal.woff2', import.meta.url),
    700: new URL('../../fonts/cormorant-garamond/cormorant-garamond-latin-700-normal.woff2', import.meta.url),
  },
} satisfies Record<FontFamilyKey, Record<number, URL>>;

/** The taka sign alone (PR 41), in the faces prices are drawn with: bold prices take the 600 face, the struck-through
 * old price and the plain lines take the 400 face (follow-up 23: it arrived after the first paint and re-laid the page
 * out, so it is preloaded too; 2.5 KB). */
const TAKA_600 = new URL('../../fonts/hind-siliguri/hind-siliguri-taka-600-normal.woff2', import.meta.url);
const TAKA_400 = new URL('../../fonts/hind-siliguri/hind-siliguri-taka-400-normal.woff2', import.meta.url);

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
 * its heaviest) and the headings (the display family at the theme's weight). With the variable files that is one
 * Instrument Sans file and one Archivo file, so every weight is in before the first paint (follow-up 23). ~~On a
 * Bengali page, also the Bengali text.~~ The Bengali faces (~~70 KB~~ 38 KB each) are never preloaded: that held back
 * the stylesheet (first paint 0.8 s later on a slow line); they come from the cache once warmed (see below).
 */
export function shopFontPreloads(tokens: ThemeTokens, lang: ShopLang): string[] {
  const body = familyOf(tokens['font-body']) ?? 'instrument-sans';
  const display = familyOf(tokens['font-display']) ?? 'archivo';
  const weight = Number.parseInt(tokens['display-weight'], 10) || 700;
  // PR 41: the taka sign of every price (2.5 KB per face; fonts/shop.css)
  const urls = [face(body, 400), face(body, 600), face('archivo', 800), face(display, weight), TAKA_600, TAKA_400];
  void lang;
  return [...new Set(urls.map(path))];
}

/**
 * Follow-up 23: the first-screen faces of the shop's own theme, preloaded by the root layout through React's
 * preload() before anything waits for the database. React then puts them at the top of <head> and in the response's
 * `Link` header, so the browser starts them before the page's scripts. ~~Only <link rel="preload"> elements in the
 * shop wrapper~~: those were placed after the eight script tags, and on a connection without HTTP/2 (six requests at
 * a time) the fonts waited behind the scripts, landed after the first paint and re-laid the page out. The wrapper
 * still preloads whatever the theme of the day adds (shopThemeFontPreloads).
 */
export function shopDefaultFontPreloads(): string[] {
  return shopFontPreloads(THEMES.classic, 'en');
}

/** The faces of the theme of the day that the root layout has not preloaded already. */
export function shopThemeFontPreloads(tokens: ThemeTokens, lang: ShopLang): string[] {
  const done = new Set(shopDefaultFontPreloads());
  return shopFontPreloads(tokens, lang).filter((u) => !done.has(u));
}

// ── Follow-up 23 · the Bengali letters, only once they are in the browser's cache ──────────────────────────────────
// A Bengali face that lands after the first paint re-shapes every line of the page (all the shop's stacks name the
// Bengali family as their fallback): about 120 ms of a slow phone's main thread, once per weight, three times on a
// Bengali page. With `optional` the late face was not even used, so that work bought nothing. Now the shop's
// Bengali faces are declared only when a cookie says the files are already cached; until then the phone's own
// Bengali font draws the letters, exactly as `optional` did on a slow line. On a Bengali page the files are fetched
// once the page is idle (never on Save-Data), the cookie is set, and every later page draws in Hind Siliguri from
// the cache before its first paint.

/** The shop's Bengali family (fonts/shop.css); the admin keeps `Hind Siliguri` from fonts/site.css. */
export const SHOP_BENGALI_FAMILY = 'Hind Siliguri Shop';
/** Set by the browser once the Bengali files are cached (components/shop/BengaliFontWarm.tsx). */
export const BENGALI_FONT_COOKIE = 'extas_bnf';

const BENGALI = {
  400: new URL('../../fonts/hind-siliguri/hind-siliguri-bengali-400-normal.woff2', import.meta.url),
  500: new URL('../../fonts/hind-siliguri/hind-siliguri-bengali-500-normal.woff2', import.meta.url),
  600: new URL('../../fonts/hind-siliguri/hind-siliguri-bengali-600-normal.woff2', import.meta.url),
} as const;

/** The Bengali block of the cut files, without the taka sign (its own tiny faces in fonts/shop.css keep it). */
export const BENGALI_RANGE = 'U+0964-0965,U+0980-09F2,U+09F4-09FE,U+200C-200D,U+25CC';

/** The addresses of the Bengali files, to fetch into the cache. */
export function bengaliFontUrls(): string[] {
  return Object.values(BENGALI).map(path);
}

/** The Bengali faces as CSS, for a page whose browser already has the files. */
export function bengaliFontFaces(): string {
  return Object.entries(BENGALI)
    .map(
      ([w, u]) =>
        `@font-face{font-family:'${SHOP_BENGALI_FAMILY}';font-style:normal;font-display:optional;font-weight:${w};` +
        `src:url('${path(u)}') format('woff2');unicode-range:${BENGALI_RANGE}}`,
    )
    .join('');
}
