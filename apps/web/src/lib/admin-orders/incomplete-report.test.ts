import { describe, expect, it } from 'vitest';
import { deviceOf, groupReport, landingOf } from './incomplete-report';

describe('PR 1061 incomplete report', () => {
  it('reads the kind of device from the browser words, and says nothing when it cannot', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('MOBILE');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; SM-A546E) Mobile Safari/537.36')).toBe('MOBILE');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 13; SM-X700) Safari/537.36')).toBe('TABLET');
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('TABLET');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('DESKTOP');
    expect(deviceOf('')).toBeNull();
    expect(deviceOf(null)).toBeNull();
    expect(deviceOf('curl/8.0')).toBeNull();
  });

  it('keeps only the path of this shop\'s own page, never the query', () => {
    expect(landingOf('https://shop.test/p/polo?utm_source=x#top', 'shop.test')).toBe('/p/polo');
    expect(landingOf('https://other.test/p/polo', 'shop.test')).toBeNull();
    expect(landingOf('not a url', 'shop.test')).toBeNull();
    expect(landingOf(null, 'shop.test')).toBeNull();
    expect(landingOf('https://shop.test/' + 'a'.repeat(300), 'shop.test')!.length).toBe(120);
  });

  it('groups by key, biggest first, with "not recorded" last', () => {
    const rows = groupReport([
      { key: null, valueMinor: 100 },
      { key: '/a', valueMinor: 10 },
      { key: '/b', valueMinor: 20 },
      { key: '/b', valueMinor: 30 },
      { key: null, valueMinor: 5 },
      { key: null, valueMinor: 5 },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['/b', '/a', null]);
    expect(rows[0]).toEqual({ key: '/b', bags: 2, valueMinor: 50 });
    expect(rows[2]).toEqual({ key: null, bags: 3, valueMinor: 110 });
  });
});
