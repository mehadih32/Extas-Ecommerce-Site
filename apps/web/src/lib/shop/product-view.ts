// PR 49 — the product as one page shows it: the catalogue's facts (lib/shop/product) turned into the client model in
// the page's language — names, colour notes, the prices already written in the page's money and digits (each price
// once), the shots of each colour, the size chart. Pure: no database, no settings beyond what the page passes.
import { DRAWN_GARMENTS, type GarmentView } from './garment-art';
import { shotsFor } from './pdp-gallery';
import { NO_COLOUR, type PdpModel, type PdpPrice } from './product-model';
import type { ProductData } from './product';
import type { ShopLang } from './lang';

export interface ModelWords {
  money: (minor: number) => string;
  /** "−20%". */
  off: (pct: number) => string;
  /** "Save ৳ 240" for an amount already written. */
  save: (amount: string) => string;
}

const inLang = (lang: ShopLang, en: string | null, bn: string | null) => (lang === 'bn' && bn?.trim() ? bn : en)?.trim() || null;

export function toModel(d: ProductData, lang: ShopLang, drawingViews: readonly GarmentView[], words: ModelWords): PdpModel {
  const prices: PdpPrice[] = [];
  const at = new Map<string, number>();
  const priceIndex = (now: number, was: number | null) => {
    const k = `${now}|${was ?? ''}`;
    let i = at.get(k);
    if (i === undefined) {
      const real = was && was > now ? was : null;
      const pct = real ? Math.round((1 - now / real) * 100) : 0;
      i = prices.push({ minor: now, now: words.money(now), was: real && pct > 0 ? words.money(real) : null, pct: real && pct > 0 ? words.off(pct) : null, save: real && pct > 0 ? words.save(words.money(real - now)) : null }) - 1;
      at.set(k, i);
    }
    return i;
  };
  const variants = d.variants.flatMap((v) => (v.priceMinor == null ? [] : [{ id: v.id, colour: v.colour, size: v.size, stock: v.stock, price: priceIndex(v.priceMinor, v.wasMinor) }]));
  // a colour or size with no priced variant is not offered
  const colours = d.colours.filter((c) => variants.some((v) => v.colour === c.key));
  const sizes = d.sizes.filter((s) => variants.some((v) => v.size === s.key));
  return {
    productId: d.id,
    name: inLang(lang, d.nameEn, d.nameBn) ?? d.nameEn,
    garment: d.garment,
    colours: colours.map((c) => ({ key: c.key, name: inLang(lang, c.nameEn, c.nameBn) ?? c.key, hex: c.hex, note: inLang(lang, c.noteEn, c.noteBn) })),
    sizes,
    variants,
    prices,
    shots: shotsFor(
      colours.map((c) => c.key),
      d.media,
      // a garment type with no drawing (accessories) gets one plain tile, not five empty views
      (DRAWN_GARMENTS as readonly string[]).includes(d.garment ?? '') ? drawingViews : drawingViews.slice(0, 1),
      NO_COLOUR,
    ),
    chart: d.chart[lang],
    onSale: d.state === 'live',
  };
}
