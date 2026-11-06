// Tests for tools/warm.mjs (PR 4 follow-up, 691): the deploy's warm-up opens the smoke list's pages once each, without
// query strings, never follows a redirect, stops at its time budget, never throws, and says what was slow.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { warm, warmLine, warmPaths } from './warm.mjs';

const smoke = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));

it('takes every smoke page once, shop pages first, without query strings or other sites', () => {
  expect(warmPaths({ storefront: ['/', '/bn', '/search?q=polo', '/search', 'https://x.test/', '//x.test/a'], admin: ['/admin?home=1', '/admin/orders', '/admin/orders?source=SUPPORT', '/admin'] })).toEqual(['/', '/bn', '/search', '/admin', '/admin/orders']);
  const paths = warmPaths(smoke);
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths.every((p) => p.startsWith('/') && !p.includes('?'))).toBe(true);
  expect(paths.filter((p) => p.startsWith('/admin')).length).toBeGreaterThan(100);
  expect(paths[0]).toBe(smoke.storefront[0]);
});

it('opens each page once without following redirects, counts failures, and stops at the budget', async () => {
  let clock = 0;
  const seen = [];
  const fetch = async (url, init) => {
    seen.push([url, init.redirect]);
    clock += url.endsWith('/slow') ? 3_000 : 100;
    if (url.endsWith('/down')) throw new Error('refused');
    return { status: url.endsWith('/boom') ? 502 : 307, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const r = await warm('http://127.0.0.1:3000', ['/a', '/slow', '/boom', '/down', '/b'], { fetch, now: () => clock, budgetMs: 10_000, top: 2 });
  expect(seen.map((x) => x[0])).toEqual(['http://127.0.0.1:3000/a', 'http://127.0.0.1:3000/slow', 'http://127.0.0.1:3000/boom', 'http://127.0.0.1:3000/down', 'http://127.0.0.1:3000/b']);
  expect(seen.every((x) => x[1] === 'manual')).toBe(true);
  expect(r).toMatchObject({ opened: 5, of: 5, failed: 2, slowest: [{ path: '/slow', ms: 3_000 }, { path: '/a', ms: 100 }] });
  clock = 0;
  const cut = await warm('http://h', ['/slow', '/slow', '/a'], { fetch, now: () => clock, budgetMs: 5_000 });
  expect(cut).toMatchObject({ opened: 2, of: 3 });
  expect(warmLine('app-blue-web-1', r)).toBe('warm: app-blue-web-1: 5/5 pages in 3.4 s, 2 without an answer; slowest: /slow 3.0 s, /a 0.1 s');
});
