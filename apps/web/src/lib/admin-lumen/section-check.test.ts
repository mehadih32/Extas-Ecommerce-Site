// PR 648 (CN-036) — the section checks find what they should and nothing else.
import { describe, expect, it } from 'vitest';
import { smallSizes, styleLiterals, unmarkedDenied, unreadyRoots } from './section-check';

describe('Lumen section checks', () => {
  it('finds a page root that is not ready', () => {
    expect(unreadyRoots('<div className="a2-z" data-lm-ready="" data-testid="x"><div className="a2-z lm-hb">')).toEqual(['<div className="a2-z lm-hb">']);
    expect(unreadyRoots('<div className="a2-zz">')).toEqual(['<div className="a2-zz">']);
    expect(unreadyRoots('<div className="a2-card">')).toEqual([]);
  });

  it('finds colour literals and font families, not tokens or comments', () => {
    expect(styleLiterals('.a { color: #fff; background: rgba(0,0,0,.2); font-family: "X"; } /* #abcdef */')).toEqual(['#fff', 'rgba(', 'font-family: "']);
    expect(styleLiterals('.a { color: var(--lm-ink); font: 700 1rem var(--lm-font-disp); }')).toEqual([]);
  });

  it('finds fixed sizes under 14 px only', () => {
    expect(smallSizes('.a { font-size: 12px } .b { font: 700 13.5px/1 var(--lm-font) } .c { font-size: 14px } .d { font-size: var(--lm-fs-card) }')).toHaveLength(2);
  });

  it('finds a no-access wrapper without the page testid or the ready mark', () => {
    const ok = '<div className="a2-z" data-lm-ready="" data-testid="x">\n  <ShellState view={view} kind="denied" />';
    const bad = '<div className="a2-z" data-lm-ready="">\n  <ShellState view={view} kind="denied" />';
    expect(unmarkedDenied(ok)).toEqual([]);
    expect(unmarkedDenied(bad)).toEqual(['<div className="a2-z" data-lm-ready="">']);
  });
});
