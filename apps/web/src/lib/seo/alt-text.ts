// S11 · PR 232 — a product photo's description for search engines and screen readers (alt text), written by the shop
// (App. answers #9: alt text is auto-applied). Pure: the facts and the shop's dictionary words in, the text out. The same
// words the product page uses when a photo has none (`pdp.alt` "{name} in {colour}, {view}", `pdp.view.<kind>`), so a
// written description and the page's own read alike. English is written onto the photo (MediaAsset.altEn) and goes live
// at once; Bengali is never written: a Bengali page builds it from the Bengali dictionary words, so it changes with the
// dictionary and shows only once the Bengali pages are live.
import { SHOT_KIND } from '../shop/pdp-gallery';

export interface AltFacts {
  /** The product's name in the page's language. */
  name: string;
  /** The photo's colour name, or null for a photo shown for every colour. */
  colour: string | null;
  /** ProductMedia.role (FRONT, BACK, … TRUE_COLOUR). */
  role: string;
}

/** The shop's dictionary words for one language (ShopContext.t). */
export type AltWords = (key: string, vars?: Record<string, string>) => string;

/** Cut at the last whole word that fits (no half word, no dots). */
export function clipWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > 0 ? cut.slice(0, at) : text.slice(0, max)).replace(/[\s,;:·-]+$/, '');
}

/** The description, or null when there is none to write (a video, or a product with no name yet). */
export function altTextFor(f: AltFacts, w: AltWords, maxLength: number): string | null {
  const kind = SHOT_KIND[f.role];
  const name = f.name.replace(/\s+/g, ' ').trim();
  if (!kind || !name) return null;
  const view = w(`pdp.view.${kind}`);
  const colour = f.colour?.replace(/\s+/g, ' ').trim();
  // the product page's own form (PdpGallery altOf): with the colour, or the name and the view
  const text = colour ? w('pdp.alt', { name, colour, view }) : `${name}, ${view}`;
  return clipWords(text.replace(/\s+/g, ' ').trim(), maxLength) || null;
}
