// PR 41 · follow-up 21 — the card's quick view: only sizes that can be sold now, in the card's colour, priced; the back
// photo of that colour (else the product's); the drawing's back only when the card itself is a drawing.
import { describe, expect, it } from 'vitest';
import type { ImageSource } from '@extas/media';
import { quickCardHandler, quickOf, type QuickCard } from './card-quick';

const img = (id: string) => ({ id }) as unknown as ImageSource;
const base = {
  state: 'live' as const,
  garment: 'polo',
  colours: [
    { key: 'navy', nameEn: 'Navy', nameBn: null, hex: '#1F2A44', noteEn: null, noteBn: null },
    { key: 'white', nameEn: 'White', nameBn: null, hex: '#FFFFFF', noteEn: null, noteBn: null },
  ],
  sizes: [
    { key: 's', label: 'S' },
    { key: 'm', label: 'M' },
    { key: 'l', label: 'L' },
  ],
  variants: [
    { id: 'n-s', colour: 'navy', size: 's', stock: 2, priceMinor: 100, wasMinor: null },
    { id: 'n-m', colour: 'navy', size: 'm', stock: 0, priceMinor: 100, wasMinor: null },
    { id: 'n-l', colour: 'navy', size: 'l', stock: 4, priceMinor: null, wasMinor: null },
    { id: 'w-m', colour: 'white', size: 'm', stock: 1, priceMinor: 100, wasMinor: null },
  ],
  media: [] as { id: string; colour: string | null; role: string; photo: ImageSource | null }[],
};

describe('the card`s quick view (follow-up 21)', () => {
  it('offers only the sizes that can be sold now, priced, in the card`s colour and the size order', () => {
    expect(quickOf(base, 'navy').sizes).toEqual([{ key: 's', label: 'S', variantId: 'n-s' }]);
    expect(quickOf(base, 'white').sizes).toEqual([{ key: 'm', label: 'M', variantId: 'w-m' }]);
    // an unknown colour reads as the first one
    expect(quickOf(base, 'pink').colour).toBe('navy');
    expect(quickOf(base, null).colour).toBe('navy');
    // a ghost page (sold out, taken off) offers nothing
    expect(quickOf({ ...base, state: 'ghost' }, 'navy').sizes).toEqual([]);
  });

  it('the back photo of the colour, else the product`s; the drawing`s back only for a card that is a drawing', () => {
    expect(quickOf(base, 'navy')).toMatchObject({ back: null, drawBack: true, garment: 'polo', hex: '#1F2A44' });
    const shared = { ...base, media: [{ id: 'b', colour: null, role: 'BACK', photo: img('shared-back') }] };
    expect(quickOf(shared, 'navy')).toMatchObject({ back: { id: 'shared-back' }, drawBack: false });
    const own = { ...base, media: [...shared.media, { id: 'nb', colour: 'navy', role: 'BACK', photo: img('navy-back') }] };
    expect(quickOf(own, 'navy').back).toEqual({ id: 'navy-back' });
    expect(quickOf(own, 'white').back).toEqual({ id: 'shared-back' });
    // a photo card with no back photo shows no back view (never a drawing over a photo)
    const front = { ...base, media: [{ id: 'f', colour: 'navy', role: 'FRONT', photo: img('navy-front') }] };
    expect(quickOf(front, 'navy')).toMatchObject({ back: null, drawBack: false });
    expect(quickOf(front, 'white')).toMatchObject({ back: null, drawBack: true });
    // no garment type: no drawing to turn
    expect(quickOf({ ...base, garment: null }, 'navy').drawBack).toBe(false);
  });

  it('answers JSON, never kept by a shared cache; a malformed id or colour is a 404, a failed read a 503', async () => {
    const id = '01a16843-8572-76d2-b67e-7ac7ce65435d';
    const card: QuickCard = quickOf(base, 'navy');
    const req = (q = '') => new Request(`http://h/api/shop/card/${id}${q}`);
    const ok = await quickCardHandler(req('?c=navy'), id, 1, async (s, p, c) => (s === 1 && p === id && c === 'navy' ? card : null));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('private, no-store');
    expect(await ok.json()).toEqual({ ok: true, card });
    expect((await quickCardHandler(req(), 'nope', 1, async () => card)).status).toBe(404);
    expect((await quickCardHandler(req('?c=Bad%20colour'), id, 1, async () => card)).status).toBe(404);
    expect((await quickCardHandler(req(), id, 1, async () => null)).status).toBe(404);
    expect(
      (
        await quickCardHandler(req(), id, 1, async () => {
          throw new Error('slow');
        })
      ).status,
    ).toBe(503);
    expect((await quickCardHandler(new Request(`http://h/x`, { method: 'POST' }), id, 1, async () => card)).status).toBe(405);
  });
});
