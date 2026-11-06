// PR 49 follow-up (66) — the computer's slim bar carries the product's rating (demo 89x-owner-b.js ownb_barMid, owner
// review P6): the stars, the average and how many, from the same approved reviews as the line under the title; nothing
// when there are none. Every value is a made-up test value.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PdpBarRating } from './PdpBarRating';

describe('the slim bar rating (follow-up 66)', () => {
  it('draws the stars, the average and the count as one bar item', () => {
    const html = renderToStaticMarkup(<PdpBarRating average={4.5} avgText="4.5" countText="(12)" label="4.5 out of 5" />);
    expect(html).toContain('class="ob-bm-i ob-bm-r"');
    expect(html).toContain('data-testid="dkb-rating"');
    expect(html).toContain('<b>4.5</b>');
    expect(html).toContain('(12)');
    expect(html).toContain('aria-label="4.5 out of 5"');
  });
});
