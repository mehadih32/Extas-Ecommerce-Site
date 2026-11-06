// PR 252 follow-up (CN-036, LUMEN-SPEC §1 "text on cards never smaller than 14 px") — the Shared calendar's styles:
// its date lines and lane pills at Lumen's 14 px card size, every colour and size a --lm-* token.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { smallSizes, styleLiterals } from '@/lib/admin-lumen/section-check';

const css = readFileSync(join(__dirname, 'shared.css'), 'utf8');

describe('Website › Blog & journal › Shared calendar styles', () => {
  it('no text under 14 px and no colour literal', () => {
    expect(smallSizes(css)).toEqual([]);
    expect(styleLiterals(css)).toEqual([]);
  });

  it('the date line and the pills use the card size token', () => {
    expect(css).toMatch(/\.sc-when \{[^}]*font-size: var\(--lm-fs-card\)/);
    expect(css).toMatch(/\.sc-pill \{[^}]*font-size: var\(--lm-fs-card\)/);
  });
});
