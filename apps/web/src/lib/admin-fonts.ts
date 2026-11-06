// PR 594 (CN-026 (a)) — the admin's first faces (fonts/admin-ui.css), preloaded by app/admin/layout.tsx so the swap
// to the real face lands before or with the first paint: the English variable face always, the Bengali regular face
// when the admin is in Bengali (the guides are Bengali in both languages; they open later, after a tap). Each address
// is the same built file the stylesheet uses (`new URL(…, import.meta.url)` resolves to the hashed /_next/static path).
// PR 625 (CN-036): the Lumen look's faces — Plus Jakarta Sans (the text, one variable file) and Bricolage Grotesque
// 800 (the page title and the big numbers on the first screen). Bricolage 700 (card headings) is not preloaded: it
// loads with the page and, with `font-display: optional`, never moves text.
import type { AdminLang } from './admin-i18n';

const SANS = new URL('../fonts/plus-jakarta-sans/plus-jakarta-sans-latin-wght-normal.woff2', import.meta.url);
const DISPLAY = new URL('../fonts/bricolage-grotesque/bricolage-grotesque-latin-800-normal.woff2', import.meta.url);
const BANGLA = new URL('../fonts/hind-siliguri/hind-siliguri-bengali-400-normal.woff2', import.meta.url);

const path = (u: URL) => (u.protocol === 'file:' ? u.pathname : `${u.pathname}${u.search}`);

/** The font files to preload for an admin page in this language. Only inside the shell (signed in): the sign-in page
 *  has no big numbers, and with the Lumen stylesheet its LCP went over the 2.5 s budget (2.52–2.58 s in CI) while two
 *  faces were preloaded beside it. There the faces load with the page (`font-display: optional`, nothing moves); the
 *  Bengali face stays preloaded in Bengali, because the fallback for Bengali letters is poor. */
export function adminFontPreloads(lang: AdminLang, inShell = true): string[] {
  const faces = inShell ? [path(SANS), path(DISPLAY)] : [];
  return lang === 'bn' ? [...faces, path(BANGLA)] : faces;
}
