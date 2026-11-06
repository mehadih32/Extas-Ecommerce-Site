// PR 596 follow-up (CN-036, LUMEN-SPEC §1 "text on cards never smaller than 14 px") — Website › Side canvas: the
// approval map's zones show their number at 14 px (the legend under the maps names them), every colour a --lm-* token.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { smallSizes, styleLiterals } from '@/lib/admin-lumen/section-check';

describe('Website › Side canvas styles', () => {
  it('no text under 14 px and no colour literal', () => {
    const css = readFileSync(join(__dirname, 'side-canvas.css'), 'utf8');
    expect(smallSizes(css)).toEqual([]);
    expect(styleLiterals(css)).toEqual([]);
  });
  it('a zone on the map shows its number and the legend names it', () => {
    const src = readFileSync(join(__dirname, '../../../../components/admin/website/SideEditor.tsx'), 'utf8');
    expect(src).toContain('<span>{i + 1}</span>');
    expect(src).toContain('data-testid="sc-legend"');
  });
});
