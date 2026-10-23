// PR 64 — Fabric & care and the detail accordions.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { careList, detailBlocks, fabricLine, nextOpen, pageFacts } from './pdp-details';

const set = productSettings['pdp.details'].default;
const gsm = (n: number) => `${n} GSM`;

describe('PR 64 · details', () => {
  it('care as a list: one per line, or joined with " · "', () => {
    expect(careList('Machine wash cold · Do not bleach\nIron low')).toEqual(['Machine wash cold', 'Do not bleach', 'Iron low']);
    expect(careList(null)).toEqual([]);
  });

  it('the fabric line adds the weight only when the name does not say it', () => {
    expect(fabricLine('100% cotton piqué', 220, gsm)).toBe('100% cotton piqué · 220 GSM');
    expect(fabricLine('Cotton 220 gsm', 220, gsm)).toBe('Cotton 220 gsm');
    expect(fabricLine(null, 180, gsm)).toBe('180 GSM');
    expect(fabricLine(' ', null, gsm)).toBeNull();
  });

  it("blocks in the owner's order, each with how it opens; a block with nothing written is left out", () => {
    const c = { fabric: 'Cotton', care: [], fit: null, fitNote: null, description: 'A polo.' };
    expect(detailBlocks(set, c)).toEqual([
      { id: 'fabric', open: 'peek' },
      { id: 'desc', open: 'closed' },
    ]);
    expect(detailBlocks(set, { ...c, fabric: null, description: ' ', fitNote: 'Size up for loose' })).toEqual([{ id: 'fit', open: 'closed' }]);
  });

  it('a tap: peek opens fully, open closes, closed opens', () => {
    expect(nextOpen('peek')).toBe('open');
    expect(nextOpen('open')).toBe('closed');
    expect(nextOpen('closed')).toBe('open');
  });

  it('the page facts read only words', () => {
    expect(pageFacts({ fit: ' Regular ', fitNote: 3 })).toEqual({ fit: 'Regular', fitNote: null });
    expect(pageFacts(null)).toEqual({ fit: null, fitNote: null });
    expect(pageFacts(['x'])).toEqual({ fit: null, fitNote: null });
  });
});
