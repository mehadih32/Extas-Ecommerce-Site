// PR 597 follow-up (CN-036, LUMEN-SPEC §1 "text on cards never smaller than 14 px") — Website › More › Launch default:
// a saved look's tags (sections, side canvas, own layouts, its state) at Lumen's 14 px, every colour a --lm-* token.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { smallSizes, styleLiterals } from '@/lib/admin-lumen/section-check';

describe('Website › Launch default styles', () => {
  it('no text under 14 px and no colour literal', () => {
    const css = readFileSync(join(__dirname, 'launch-default.css'), 'utf8');
    expect(smallSizes(css)).toEqual([]);
    expect(styleLiterals(css)).toEqual([]);
  });
});
