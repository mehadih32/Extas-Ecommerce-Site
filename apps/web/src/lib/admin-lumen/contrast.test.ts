import { describe, expect, it } from 'vitest';
import { blockTokens, lumenTokens, pairRatio, ratio, resolve } from './contrast';

const CSS = `:root,
[data-lm-look] {
  --lm-r: 9px;
}
:root,
[data-lm-look='lumen'] {
  --lm-accent: #ff5a36;
  --lm-sf: #ffffff; /* card */
  --lm-ink2: #5b6885;
  --lm-mix: color-mix(in srgb, var(--lm-accent) 50%, #000000);
  --lm-glass: rgba(0, 0, 0, 0.5);
  --lm-grad: linear-gradient(180deg, #000000, var(--lm-sf));
}
[data-lm-look='lumen'][data-lm-mode='dark'] {
  --lm-sf: #111936;
}
[data-lm-look='lumen'][data-lm-mode='dark'] :is(.lm-island) {
  --lm-sf: #ffffff;
}
`;

describe('Lumen contrast reader', () => {
  it('reads a block and the modes on top of each other', () => {
    expect(blockTokens(CSS, ':root,\n[data-lm-look] {')).toEqual({
      '--lm-r': '9px',
    });
    expect(lumenTokens(CSS, 'light')['--lm-sf']).toBe('#ffffff');
    expect(lumenTokens(CSS, 'dark')['--lm-sf']).toBe('#111936');
    expect(lumenTokens(CSS, 'island')['--lm-sf']).toBe('#ffffff');
    expect(lumenTokens(CSS, 'light', '#12B5A6')['--lm-accent']).toBe('#12B5A6');
  });

  it('resolves vars, mixes, rgba and gradients', () => {
    const t = lumenTokens(CSS, 'light');
    expect(resolve('var(--lm-mix)', t)[0]!.map(Math.round)).toEqual([128, 45, 27, 1]);
    expect(resolve('color-mix(in srgb, #ffffff 50%, transparent)', t)[0]).toEqual([255, 255, 255, 0.5]);
    expect(resolve('var(--lm-glass)', t)).toEqual([[0, 0, 0, 0.5]]);
    expect(resolve('var(--lm-grad)', t)).toEqual([
      [0, 0, 0, 1],
      [255, 255, 255, 1],
    ]);
    expect(() => resolve('var(--lm-none)', t)).toThrow(/unknown token/);
  });

  it('measures WCAG contrast, the worst gradient stop and see-through layers', () => {
    const t = lumenTokens(CSS, 'light');
    expect(ratio([255, 255, 255, 1], [0, 0, 0, 1])).toBeCloseTo(21, 5);
    expect(pairRatio(t, 'var(--lm-ink2)', 'var(--lm-sf)')).toBeCloseTo(5.58, 2);
    expect(pairRatio(t, '#ffffff', 'var(--lm-grad)')).toBe(1);
    // half-black glass over white is mid grey: white text on it is weak
    expect(pairRatio(t, '#ffffff', 'var(--lm-glass)', '#ffffff')).toBeLessThan(4.5);
  });
});
