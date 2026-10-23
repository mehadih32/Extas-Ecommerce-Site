// PR 41 · follow-up 21 (demo 97-desk-a.js deskCard, D-013) — what a product card shows under a computer's mouse: the
// back view of the card's colour and "Quick add", the sizes that can be sold now in that colour. Read when the mouse
// (or the keyboard) first reaches a card, never while the page loads, so a phone never pays for it. The sizes come from
// the product page's own read (`productData`: the stock mirror's sellable pieces, the variant's own price), so the
// card never offers what the product page would refuse. Pure model + one read.
import type { ImageSource } from '@extas/media';
import { getPrisma } from '@extas/db/client';
import { productData, type ProductData } from './product';
import { NO_COLOUR } from './product-model';

export interface QuickSize {
  key: string;
  label: string;
  variantId: string;
}

export interface QuickCard {
  /** The colour the card shows ('*' for a product without colours). */
  colour: string;
  /** Sizes that can be sold now in that colour, priced, in the size order. Empty: sold out in this colour. */
  sizes: QuickSize[];
  /** The back photo of that colour (else the product's own back photo). */
  back: ImageSource | null;
  /** No photo at all for that colour: the card is a drawing, so its back view is the drawing's back. */
  drawBack: boolean;
  garment: string | null;
  hex: string;
}

type Facts = Pick<ProductData, 'state' | 'colours' | 'sizes' | 'variants' | 'media' | 'garment'>;

/** The card's quick view for a colour (an unknown colour reads as the product's first). */
export function quickOf(d: Facts, colour: string | null): QuickCard {
  const c = d.colours.find((x) => x.key === colour) ?? d.colours[0] ?? null;
  const key = c?.key ?? null;
  const sizes =
    d.state === 'live'
      ? d.sizes.flatMap((s) => {
          const v = d.variants.find((x) => x.colour === key && x.size === s.key && x.stock > 0 && x.priceMinor !== null);
          return v ? [{ key: s.key, label: s.label, variantId: v.id }] : [];
        })
      : [];
  const ofColour = d.media.filter((m) => m.photo && (m.colour === key || m.colour === null));
  const back = ofColour.find((m) => m.role === 'BACK' && m.colour === key) ?? ofColour.find((m) => m.role === 'BACK' && m.colour === null) ?? null;
  // the card shows the colour's front photo (else the product's); with none it is the drawing (catalogue.ts photoFor)
  const front = ofColour.some((m) => m.role === 'FRONT');
  return { colour: key ?? NO_COLOUR, sizes, back: back?.photo ?? null, drawBack: !front && !back && !!d.garment, garment: d.garment, hex: c?.hex ?? '' };
}

/** The quick view of a published product's card, or null (no such product, no database, or the read failed). */
export async function quickCard(storeId: number, productId: string, colour: string | null): Promise<QuickCard | null> {
  if (!process.env.DATABASE_URL) return null;
  const row = await getPrisma().product.findFirst({ where: { storeId, id: productId, archivedAt: null }, select: { slug: true } });
  if (!row) return null;
  const d = await productData(storeId, row.slug);
  return d ? quickOf(d, colour) : null;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOUR = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * GET /api/shop/card/<productId>?c=<colour> — public and read-only: the card's quick view as JSON. Never kept by a
 * shared cache (the stock moves); an unknown or malformed id is a 404, a failed read a 503.
 */
export async function quickCardHandler(request: Request, productId: string, storeId: number, read = quickCard): Promise<Response> {
  const headers = { 'content-type': 'application/json', 'cache-control': 'private, no-store' };
  const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (request.method !== 'GET') return answer(405, { ok: false, error: 'method-not-allowed' });
  const colour = new URL(request.url).searchParams.get('c');
  if (!ID.test(productId) || (colour !== null && !COLOUR.test(colour))) return answer(404, { ok: false, error: 'not-found' });
  try {
    const card = await read(storeId, productId, colour);
    return card ? answer(200, { ok: true, card }) : answer(404, { ok: false, error: 'not-found' });
  } catch (e) {
    console.warn(`shop: card quick view unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return answer(503, { ok: false, error: 'unavailable' });
  }
}
