import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deskSloganSteps, fitDeskRow, wordsSqueezed } from './desk-nav-fit';

describe('PR 40 follow-up · the computer header row with a long slogan', () => {
  it('steps the desktop slogan the phone way: full, the short one only when written, then none', () => {
    expect(deskSloganSteps(true)).toEqual([0, 1, 2]);
    expect(deskSloganSteps(false)).toEqual([0, 2]);
  });

  it('keeps the full slogan while folding categories is enough (the demo fold comes first)', () => {
    const shown: number[] = [];
    expect(fitDeskRow([0, 1, 2], (s) => shown.push(s), () => true)).toBe(0);
    expect(shown).toEqual([0]);
  });

  it('steps the slogan down only while the row still does not fit, and stops at the first step that fits', () => {
    const shown: number[] = [];
    let tries = 0;
    expect(fitDeskRow([0, 1, 2], (s) => shown.push(s), () => ++tries === 2)).toBe(1);
    expect(shown).toEqual([0, 1]);
  });

  it('ends on the last step (no slogan) when nothing fits', () => {
    const shown: number[] = [];
    expect(fitDeskRow([0, 2], (s) => shown.push(s), () => false)).toBe(2);
    expect(shown).toEqual([0, 2]);
  });

  it('counts an item narrower than its words as squeezed, past a pixel of rounding', () => {
    expect(wordsSqueezed(52, 32)).toBe(true);
    expect(wordsSqueezed(32.8, 32)).toBe(false);
    expect(wordsSqueezed(30, 32)).toBe(false);
  });

  it('hides the desktop slogan at step 2 (the desktop rule that shows it is stronger than the shared one)', () => {
    const css = readFileSync(join(__dirname, '../../app/(shop)/shop.css'), 'utf8');
    expect(css).toMatch(/@media \(min-width: 1024px\) \{ \.shop \.hdr \.logo\.hide-m\.sb-hasslog \.sb-slog\[data-l="2"\] \{ display: none; \} \}/);
  });
});
