import { describe, expect, it } from 'vitest';
import { JUMP_KEYS, JUMP_WAIT_MS, jumpStep, readRecent, recentPath, withRecent } from './shortcuts';

describe('PR 12 follow-up 209 · the palette recent pages and the "g" key jumps', () => {
  it('keeps an admin page path only (no query, no hash, no other site)', () => {
    expect(recentPath('/admin/orders')).toBe('/admin/orders');
    expect(recentPath('/admin/products/reviews')).toBe('/admin/products/reviews');
    expect(recentPath('/admin')).toBe('/admin');
    expect(recentPath('/admin/orders?view=late')).toBeNull();
    expect(recentPath('/admin/login')).toBeNull();
    expect(recentPath('/p/polo')).toBeNull();
    expect(recentPath('https://x.example/admin')).toBeNull();
    expect(recentPath(`/admin/${'a'.repeat(200)}`)).toBeNull();
    expect(recentPath(3)).toBeNull();
  });

  it('puts the newest first, once, and keeps at most the asked number', () => {
    expect(withRecent([], '/admin/orders', 3)).toEqual(['/admin/orders']);
    expect(withRecent(['/admin/orders', '/admin/products'], '/admin/products', 3)).toEqual(['/admin/products', '/admin/orders']);
    expect(withRecent(['/admin/a', '/admin/b', '/admin/c'], '/admin/d', 3)).toEqual(['/admin/d', '/admin/a', '/admin/b']);
    expect(withRecent(['/admin/a'], '/admin/b', 0)).toEqual([]);
  });

  it('reads a stored list leniently: broken entries and repeats are dropped', () => {
    expect(readRecent(['/admin/a', 'nope', '/admin/a', 5, '/admin/b'])).toEqual(['/admin/a', '/admin/b']);
    expect(readRecent('x')).toEqual([]);
    expect(readRecent(undefined)).toEqual([]);
  });

  it('"g" then a letter opens its section, inside the wait; anything else cancels', () => {
    expect(JUMP_KEYS.d).toBe('dashboard');
    expect(JUMP_KEYS.o).toBe('orders');
    const a = jumpStep(null, 'g', 1000);
    expect(a).toEqual({ pending: 1000, section: null });
    expect(jumpStep(a.pending, 'd', 1000 + JUMP_WAIT_MS - 1)).toEqual({ pending: null, section: 'dashboard' });
    expect(jumpStep(a.pending, 'o', 1200)).toEqual({ pending: null, section: 'orders' });
    expect(jumpStep(a.pending, 'd', 1000 + JUMP_WAIT_MS + 1)).toEqual({ pending: null, section: null });
    expect(jumpStep(a.pending, 'x', 1200)).toEqual({ pending: null, section: null });
    expect(jumpStep(null, 'd', 1200)).toEqual({ pending: null, section: null });
    expect(jumpStep(null, 'G', 5)).toEqual({ pending: 5, section: null });
  });
});
