// Tests for tools/smoke.mjs (run with the web tests). The browser journey itself runs in CI and on the runner.
import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { adminLinks, pageProblems, reportMarkdown, requestCounts, totpCode } from './smoke.mjs';

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
