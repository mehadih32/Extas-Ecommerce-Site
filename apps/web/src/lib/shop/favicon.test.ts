import { describe, expect, it } from 'vitest';
import type { ImageSource } from '@extas/media';
import { neutralIconSvg, smallestRendition } from './favicon';
import { THEMES } from './tokens';

describe('tab icon (CN-016)', () => {
  it('the neutral icon is the bag on the theme colour, with no name or letters in it', () => {
    const svg = neutralIconSvg(THEMES.classic);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`fill="${THEMES.classic.brand}"`);
    expect(svg).toContain(`stroke="${THEMES.classic.surface}"`);
    expect(svg).not.toMatch(/<text/);
  });

  it('the owner icon uses its smallest rendition; none uploaded gives null', () => {
    const src = { variants: [{ width: 800, url: '/media/b' }, { width: 400, url: '/media/a' }] } as unknown as ImageSource;
    expect(smallestRendition(src)).toBe('/media/a');
    expect(smallestRendition(undefined)).toBeNull();
    expect(smallestRendition({ variants: [] } as unknown as ImageSource)).toBeNull();
  });
});
