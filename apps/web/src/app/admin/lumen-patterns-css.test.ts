// PR 627 follow-up (CN-036, LUMEN-SPEC §1 "text on cards never smaller than 14 px") — the shared Lumen patterns' styles
// (summary tiles, hero chart, toast, queue, list, split, form + live preview with its badge, settings cards): no text
// under 14 px. PR 628 follow-up (contrast audit): a chip's count is not faded, and the list search pattern does not
// restyle the shell's sidebar search, which has the same class name.
import { describe, expect, it } from 'vitest';
import { readAdmin, smallSizes } from '@/lib/admin-lumen/section-check';

describe('Lumen shared pattern styles', () => {
  it('no text under 14 px', () => {
    expect(smallSizes(readAdmin('lumen-patterns.css'))).toEqual([]);
  });

  it('the list search pattern leaves the shell sidebar search alone (it stretched to fill a tall sidebar)', () => {
    const heads = readAdmin('lumen-patterns.css')
      .split('\n')
      .filter((line) => /\.lm-search\b[^{]*\{/.test(line) && !line.trim().startsWith('/*'));
    expect(heads.length).toBeGreaterThan(0);
    for (const line of heads) expect(line).toContain('.lm-search:not(.lm-side *)');
  });

  it('a chip count is drawn at full strength (3.3:1 at 0.75 on a light card)', () => {
    expect(readAdmin('lumen-patterns.css')).toContain(
      '[data-lm-look] .lm-chip i { font-style: normal; font-variant-numeric: tabular-nums; }',
    );
  });
});
