// S28 · PR 700 — the pure side of the visitors view: device from width, a referrer as its host, what a page view may carry
// (nothing with collect off), the source of a view, and the day's fold into roll-up rows.
import { describe, expect, it } from 'vitest';
import { deviceOf, foldDay, refHost, sourceOf, sumDim, visitorProps } from './visitors-pure';

describe('what a page view may carry', () => {
  it('names the device by the page width', () => {
    expect(deviceOf(390)).toBe('mobile');
    expect(deviceOf(768)).toBe('tablet');
    expect(deviceOf(1366)).toBe('desktop');
    expect(deviceOf(Number.NaN)).toBe('mobile');
  });
  it('keeps a referrer as its host only, without www; the shop itself and nothing are empty', () => {
    expect(refHost('https://www.google.com/search?q=polo+shirt', 'shop.example.test')).toBe('google.com');
    expect(refHost('https://shop.example.test/p/polo', 'shop.example.test')).toBe('');
    expect(refHost('', null)).toBe('');
    expect(refHost(42, null)).toBe('');
    expect(refHost('l.facebook.com/l.php?u=1', null)).toBe('l.facebook.com');
  });
  it('carries nothing while collect is off', () => {
    expect(visitorProps({ ref: 'https://google.com', device: 'mobile', path: '/x' }, { collect: false, region: 'Dhaka', ownHost: null })).toEqual({});
  });
  it('shapes and whitelists with collect on: no query in a path, a device of three, no unknown keys, never an ip or a phone', () => {
    const p = visitorProps({ ref: 'https://www.google.com/x?q=1', utm_source: ' Facebook ', utm_medium: 'cpc', device: 'tv', path: '/p/polo?token=abc#x', sid: 'abc123def', ip: '203.0.113.9', phone: '01711223344', name: 'A' }, { collect: true, region: 'Dhaka', ownHost: 'shop.example.test' });
    expect(p).toEqual({ ref: 'google.com', utm_source: 'facebook', utm_medium: 'cpc', path: '/p/polo', sid: 'abc123def', region: 'Dhaka' });
    expect(visitorProps({ path: '//evil.test/x', sid: 'x y' }, { collect: true, region: null, ownHost: null })).toEqual({});
    expect(visitorProps('junk', { collect: true, region: null, ownHost: null })).toEqual({});
  });
  it('the source is the UTM source, else the referrer host, else direct', () => {
    expect(sourceOf({ utm_source: 'Facebook', ref: 'google.com' })).toBe('facebook');
    expect(sourceOf({ ref: 'google.com' })).toBe('google.com');
    expect(sourceOf(null)).toBe('direct');
  });
});

describe('the day roll-up', () => {
  const f = (visitorId: string, pageType: string, props: Record<string, unknown> | null = null) => ({ visitorId, pageType, props });
  it('folds views, visitors and sessions per dimension value', () => {
    const rows = foldDay([f('a', 'home', { ref: 'google.com', device: 'mobile', sid: 's1' }), f('a', 'product', { ref: 'google.com', device: 'mobile', sid: 's1', path: '/p/x' }), f('b', 'home', { utm_source: 'facebook', device: 'desktop', region: 'Dhaka', sid: 's2' }), f('a', 'home', { device: 'mobile', sid: 's3' }), f('c', 'home')]);
    const at = (dim: string, key: string) => rows.find((r) => r.dim === dim && r.key === key);
    expect(at('all', '')).toEqual({ dim: 'all', key: '', views: 5, visitors: 3, sessions: 4 });
    expect(at('source', 'google.com')).toMatchObject({ views: 2, visitors: 1 });
    expect(at('source', 'facebook')).toMatchObject({ views: 1 });
    expect(at('source', 'direct')).toMatchObject({ views: 2, visitors: 2 });
    expect(at('page', 'home')).toMatchObject({ views: 4, visitors: 3 });
    expect(at('device', 'mobile')).toMatchObject({ views: 3, visitors: 1, sessions: 2 });
    expect(at('region', 'Dhaka')).toMatchObject({ views: 1 });
    expect(at('path', '/p/x')).toMatchObject({ views: 1 });
    expect(foldDay([])).toEqual([]);
  });
  it('sums a dimension over days, biggest first, cut to the top', () => {
    const rows = [{ dim: 'source', key: 'a', views: 2, visitors: 1 }, { dim: 'source', key: 'b', views: 5, visitors: 4 }, { dim: 'source', key: 'a', views: 4, visitors: 2 }, { dim: 'page', key: 'home', views: 99, visitors: 9 }];
    expect(sumDim(rows, 'source', 5)).toEqual([{ key: 'a', views: 6, visitors: 3 }, { key: 'b', views: 5, visitors: 4 }]);
    expect(sumDim(rows, 'source', 1)).toEqual([{ key: 'a', views: 6, visitors: 3 }]);
  });
});
