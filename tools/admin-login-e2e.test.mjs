// Tests for tools/admin-login-e2e.mjs (run with the web tests). The browser journey itself runs in CI.
import { expect, it } from 'vitest';
import { adminLinks, pageProblems } from './admin-login-e2e.mjs';

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
