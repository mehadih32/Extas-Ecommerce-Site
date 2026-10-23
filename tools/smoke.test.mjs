// Tests for tools/smoke.mjs (run with the web tests). The browser journey itself runs in CI and on the runner.
import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adminLinks, checkProblem, discovered, pageProblems, reportMarkdown, requestCounts, totpCode } from './smoke.mjs';

it('PR 6: an extra check passes on the expected value or answer, and says what it saw otherwise', () => {
  const page = { pr: 6, what: 'worker fresh', page: '/admin/server', selector: '[data-worker-state]', attribute: 'data-worker-state', equals: 'ok' };
  expect(checkProblem(page, { value: 'ok' })).toBeNull();
  expect(checkProblem(page, { value: 'stale' })).toBe('check (PR 6): worker fresh: [data-worker-state] data-worker-state is "stale", expected "ok"');
  expect(checkProblem(page, { value: null })).toContain('"missing"');
  expect(checkProblem(page, { error: 'Timeout 15000ms exceeded.' })).toBe('check (PR 6): worker fresh: Timeout 15000ms exceeded.');
  const req = { pr: 196, what: 'unsigned refused', request: { method: 'POST', path: '/api/x' }, status: 401 };
  expect(checkProblem(req, { status: 401 })).toBeNull();
  expect(checkProblem(req, { status: 200 })).toBe('check (PR 196): unsigned refused: answered 200, expected 401');
});

it('every configured check names its PR and is a page check or a request check', () => {
  const config = JSON.parse(readFileSync(new URL('../docs/qa/smoke.json', import.meta.url), 'utf8'));
  expect(config.checks.length).toBeGreaterThan(0);
  for (const c of config.checks) {
    expect(Number.isInteger(c.pr), c.what).toBe(true);
    expect(Boolean(c.request) !== Boolean(c.page), c.what).toBe(true);
    if (c.page) expect([c.selector, c.attribute, c.equals].every((v) => typeof v === 'string'), c.what).toBe(true);
    else expect(Number.isInteger(c.status), c.what).toBe(true);
  }
});

it('PR 49: opens the first product pages a built page links to, each once, never another site', () => {
  expect(discovered(['/p/polo?color=navy', '/p/polo', '//evil.test/p/x', 'https://x.test/p/y', '/bn/p/chino#a', '/p/socks'], 2)).toEqual(['/p/polo', '/bn/p/chino']);
  expect(discovered([], 2)).toEqual([]);
});

it('a 5xx or the error screen is a problem; a normal page is not', () => {
  expect(pageProblems('/admin/products', 200, 'Products 0 items')).toEqual([]);
  expect(pageProblems('/admin/products', 500, 'x')).toEqual(['/admin/products: answered 500']);
  expect(pageProblems('/admin', 200, 'This page couldn’t load A server error occurred.')).toEqual(['/admin: shows the error screen']);
});

it('opens each admin menu page once, never the sign-in page, the API or outside links', () => {
  expect(adminLinks(['/admin/stock?x=1', '/admin/stock', '/admin/login?next=/admin', '/status', 'https://example.test/admin', '/admin/products#a'])).toEqual([
    '/admin/products',
    '/admin/stock',
  ]);
});

it('a failed request counts unless it is on the known list; other sites count too', () => {
  const base = 'https://staging.example.test';
  const ignore = [{ path: '/favicon.ico', until: 'PR 501' }];
  expect(requestCounts(`${base}/favicon.ico`, base, ignore)).toBe(false);
  expect(requestCounts(`${base}/_next/static/x.js`, base, ignore)).toBe(true);
  expect(requestCounts('https://cdn.example.test/favicon.ico', base, ignore)).toBe(true);
});

it('makes the same two-step code as RFC 6238 (SHA-1, 6 digits, 30 s)', () => {
  // RFC 6238 appendix B seed "12345678901234567890", T = 59 s → 94287082 (8 digits) → 287082 (6 digits).
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  expect(totpCode(secret, 59_000)).toBe('287082');
  expect(createHmac('sha1', 'x').digest('hex')).toHaveLength(40);
});

it('the report starts with a Bengali line and lists every page', () => {
  const md = reportMarkdown(
    { ok: false, pages: 2, failed: 1, problems: ['/admin: shows the error screen'], rows: [
      { path: '/', screen: 'phone', status: 200, landed: '/', ok: true, problems: [], screenshot: 'home-phone.png' },
      { path: '/admin', screen: 'phone', status: 500, landed: '/admin', ok: false, problems: ['/admin: shows the error screen'], screenshot: 'admin-phone.png' },
    ] },
    { at: '2026-10-20T15:00:00+06:00', base: 'https://staging.example.test', sha: 'abc1234', kind: 'after deploy', rolledBack: true },
  );
  expect(md).toContain('বাংলায়');
  expect(md).toContain('আগের ভালো ভার্সনে');
  expect(md).toContain('| `/admin` | phone | 500 |');
});
