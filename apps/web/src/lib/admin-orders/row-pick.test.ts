import { describe, expect, it } from 'vitest';
import { isPlainClick, pick, rowTap } from './row-pick';

const ev = (over: Partial<Parameters<typeof isPlainClick>[0]> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...over,
});

describe('the order list rows without per-row handlers (follow-up 223)', () => {
  it('takes over only a plain left click', () => {
    expect(isPlainClick(ev())).toBe(true);
    expect(isPlainClick(ev({ metaKey: true }))).toBe(false);
    expect(isPlainClick(ev({ ctrlKey: true }))).toBe(false);
    expect(isPlainClick(ev({ shiftKey: true }))).toBe(false);
    expect(isPlainClick(ev({ button: 1 }))).toBe(false);
    expect(isPlainClick(ev({ defaultPrevented: true }))).toBe(false);
  });

  it('opens the row, follows the order link, and leaves tick boxes and buttons alone', () => {
    expect(rowTap(null, '/admin/orders/a', true)).toEqual({
      kind: 'row',
      href: '/admin/orders/a',
    });
    expect(rowTap({ linkHref: '/admin/orders/a' }, '/admin/orders/a', true)).toEqual({ kind: 'link', href: '/admin/orders/a' });
    expect(rowTap({ linkHref: null }, '/admin/orders/a', true)).toEqual({
      kind: 'none',
    });
    expect(rowTap(null, null, true)).toEqual({ kind: 'none' });
    expect(rowTap(null, '/admin/orders/a', false)).toEqual({ kind: 'none' });
    expect(rowTap({ linkHref: '/admin/orders/a' }, '/admin/orders/a', false)).toEqual({ kind: 'none' });
  });

  it('adds and removes one order, or every shown one, and ignores an id not shown', () => {
    const ids = ['a', 'b', 'c'];
    let s = pick(new Set(), ids, 'a', true);
    s = pick(s, ids, 'c', true);
    expect([...s]).toEqual(['a', 'c']);
    s = pick(s, ids, 'a', false);
    expect([...s]).toEqual(['c']);
    expect(pick(s, ids, 'zz', true)).toBe(s);
    expect([...pick(s, ids, 'all', true)]).toEqual(ids);
    expect(pick(s, ids, 'all', false).size).toBe(0);
  });
});
