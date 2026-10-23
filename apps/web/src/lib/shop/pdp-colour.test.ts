// PR 55 — where "All N colours" sits, each colour's own address, and its canonical address.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { allColoursAt, canonicalFor, colourHref } from './pdp-colour';

const page = productSettings['pdp.page'].default;
const colour = productSettings['pdp.colour'].default;

describe('PR 55 · colours', () => {
  it('"All N colours": after the last swatch below the owner number, up on the colour line from it, never for one colour', () => {
    expect(allColoursAt(1, colour)).toBeNull();
    expect(allColoursAt(3, colour)).toBe('row');
    expect(allColoursAt(colour.allColoursFrom, colour)).toBe('up');
    expect(allColoursAt(8, { ...colour, allColours: false })).toBeNull();
  });

  it('each colour has its own address, or a ?color= link while colour addresses are off', () => {
    expect(colourHref('/p/polo', 'navy', page)).toBe('/p/polo/navy');
    expect(colourHref('/p/polo', 'sky blue', { colourPaths: false })).toBe('/p/polo?color=sky%20blue');
  });

  it('a colour page names the main product as canonical by default, or itself where the owner says so', () => {
    expect(canonicalFor('/p/polo', 'navy', 'polos', page)).toBe('/p/polo');
    expect(canonicalFor('/p/polo', 'navy', 'polos', { ...page, canonical: 'colour' })).toBe('/p/polo/navy');
    expect(canonicalFor('/p/polo', 'navy', 'polos', { ...page, canonicalByCategory: { polos: 'colour' } })).toBe('/p/polo/navy');
    expect(canonicalFor('/p/polo', 'navy', 'shirts', { ...page, canonicalByCategory: { polos: 'colour' } })).toBe('/p/polo');
    expect(canonicalFor('/p/polo', null, null, { ...page, canonical: 'colour' })).toBe('/p/polo');
    expect(canonicalFor('/p/polo', 'navy', null, { ...page, colourPaths: false, canonical: 'colour' })).toBe('/p/polo');
  });
});
