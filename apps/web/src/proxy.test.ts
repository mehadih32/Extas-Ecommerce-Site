// PR 84 follow-up (review R1) — a /bn page keeps its Bengali when Next sends the proxy's rewrite on as a second request
// (a server bound to 127.0.0.1: every /bn page drew in English with <html lang="en">). The second pass carries the
// proxy's own random mark; a browser that sends the language headers itself still gets English. The redirect table and
// the Bengali gate are stand-ins here (no database).
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('./lib/seo/redirect-table', () => ({ redirectTable: async () => ({}), forwardOf: () => null, countRedirectHit: () => {} }));
vi.mock('./lib/seo/bengali-gate', () => ({ bengaliGateSends: async () => false }));
vi.mock('./lib/shop/store-id', () => ({ shopStoreId: () => 1 }));

const { proxy } = await import('./proxy');

const BASE = 'http://127.0.0.1:3000';
/** The request headers the proxy hands to the page (Next's override headers on its answer). */
const handed = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

describe('the shop language through the proxy', () => {
  it('a /bn page is rewritten to its page with the Bengali language, path and the mark', async () => {
    const res = await proxy(new NextRequest(`${BASE}/bn/bag`));
    expect(new URL(res.headers.get('x-middleware-rewrite')!).pathname).toBe('/bag');
    expect(handed(res, 'x-extas-lang')).toBe('bn');
    expect(handed(res, 'x-extas-path')).toBe('/bag');
    expect(handed(res, 'x-extas-rewrite')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('the rewrite seen again (Next sent it on as a new request) keeps Bengali', async () => {
    const first = await proxy(new NextRequest(`${BASE}/bn/help/faq`));
    const headers = new Headers();
    for (const n of ['x-extas-lang', 'x-extas-path', 'x-extas-rewrite']) headers.set(n, handed(first, n)!);
    const again = await proxy(new NextRequest(`${BASE}/help/faq`, { headers }));
    expect(again.headers.get('x-middleware-rewrite')).toBeNull();
    expect(handed(again, 'x-extas-lang')).toBe('bn');
    expect(handed(again, 'x-extas-path')).toBe('/help/faq');
    expect(handed(again, 'x-extas-rewrite')).toBeNull();
  });

  it('a browser that sends the language headers itself gets the English page (no mark, or a wrong one)', async () => {
    for (const mark of [null, '00000000-0000-4000-8000-000000000000']) {
      const headers = new Headers({ 'x-extas-lang': 'bn', 'x-extas-path': '/bag' });
      if (mark) headers.set('x-extas-rewrite', mark);
      const res = await proxy(new NextRequest(`${BASE}/bag`, { headers }));
      expect(handed(res, 'x-extas-lang')).toBe('en');
      expect(handed(res, 'x-extas-rewrite')).toBeNull();
    }
  });

  it('the mark is only good for the page it was given for', async () => {
    const first = await proxy(new NextRequest(`${BASE}/bn/bag`));
    const headers = new Headers();
    for (const n of ['x-extas-lang', 'x-extas-path', 'x-extas-rewrite']) headers.set(n, handed(first, n)!);
    const res = await proxy(new NextRequest(`${BASE}/checkout`, { headers }));
    expect(handed(res, 'x-extas-lang')).toBe('en');
  });

  it('an English page stays English', async () => {
    const res = await proxy(new NextRequest(`${BASE}/collections/new-in`));
    expect(handed(res, 'x-extas-lang')).toBe('en');
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
