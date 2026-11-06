// PR 72 follow-up (106) — the arrow keys through the suggestions (stand-in elements; no page needed).
import { describe, expect, it } from 'vitest';
import { ACTIVE, stepActive, suggestKey, type SuggestBox, type SuggestItem } from './suggest-keys';

const el = () => {
  const attrs = new Map<string, string>();
  let clicked = 0;
  const node = {
    id: '',
    hasAttribute: (n: string) => attrs.has(n),
    setAttribute: (n: string, v: string) => void attrs.set(n, v),
    removeAttribute: (n: string) => void attrs.delete(n),
    click: () => void clicked++,
    attr: (n: string) => attrs.get(n),
    clicks: () => clicked,
  };
  return node as SuggestItem & SuggestBox & { attr: (n: string) => string | undefined; clicks: () => number };
};

describe('stepActive (follow-up 106)', () => {
  it('↓ starts at the first, ↑ at the last; past either end it is back in the box', () => {
    expect(stepActive(-1, 3, 1)).toBe(0);
    expect(stepActive(-1, 3, -1)).toBe(2);
    expect(stepActive(0, 3, 1)).toBe(1);
    expect(stepActive(2, 3, 1)).toBe(-1);
    expect(stepActive(0, 3, -1)).toBe(-1);
    expect(stepActive(-1, 0, 1)).toBe(-1);
  });
});

describe('suggestKey (follow-up 106)', () => {
  it('moves one highlight, names it on the box, Enter opens it, typing takes it off', () => {
    const box = el();
    const items = [el(), el(), el()];
    expect(suggestKey('ArrowDown', box, items, 'sg')).toBe(true);
    expect(items[0]!.hasAttribute(ACTIVE)).toBe(true);
    expect(box.attr('aria-activedescendant')).toBe('sg-0');
    expect(suggestKey('ArrowDown', box, items, 'sg')).toBe(true);
    expect(items.map((i) => i.hasAttribute(ACTIVE))).toEqual([false, true, false]);
    expect(box.attr('aria-activedescendant')).toBe('sg-1');
    expect(suggestKey('Enter', box, items, 'sg')).toBe(true);
    expect(items[1]!.clicks()).toBe(1);
    expect(suggestKey('a', box, items, 'sg')).toBe(false);
    expect(items.some((i) => i.hasAttribute(ACTIVE))).toBe(false);
    expect(box.attr('aria-activedescendant')).toBeUndefined();
  });

  it('without a highlight Enter is the search, and an empty list leaves the arrows alone', () => {
    const box = el();
    expect(suggestKey('Enter', box, [el()], 'sg')).toBe(false);
    expect(suggestKey('ArrowDown', box, [], 'sg')).toBe(false);
  });

  it('↑ from the first goes back to the box with no highlight', () => {
    const box = el();
    const items = [el(), el()];
    suggestKey('ArrowDown', box, items, 'sg');
    suggestKey('ArrowUp', box, items, 'sg');
    expect(items.some((i) => i.hasAttribute(ACTIVE))).toBe(false);
    expect(box.attr('aria-activedescendant')).toBeUndefined();
  });
});
