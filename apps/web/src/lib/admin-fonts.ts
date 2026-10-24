// PR 594 (CN-026 (a)) — the admin's first faces (fonts/admin-ui.css), preloaded by app/admin/layout.tsx so the swap
// to the real face lands before or with the first paint: the English variable face always, the Bengali regular face
// when the admin is in Bengali (the guides are Bengali in both languages; they open later, after a tap). Each address
// is the same built file the stylesheet uses (`new URL(…, import.meta.url)` resolves to the hashed /_next/static path).
import type { AdminLang } from './admin-i18n';

const SANS = new URL('../fonts/instrument-sans/instrument-sans-latin-wght-normal.woff2', import.meta.url);
const BANGLA = new URL('../fonts/hind-siliguri/hind-siliguri-bengali-400-normal.woff2', import.meta.url);

const path = (u: URL) => (u.protocol === 'file:' ? u.pathname : `${u.pathname}${u.search}`);

/** The font files to preload for an admin page in this language. */
export function adminFontPreloads(lang: AdminLang): string[] {
  return lang === 'bn' ? [path(SANS), path(BANGLA)] : [path(SANS)];
}
