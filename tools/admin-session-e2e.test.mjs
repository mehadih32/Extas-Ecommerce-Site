// Tests for tools/admin-session-e2e.mjs (run with the web tests). The browser journey itself runs in CI and on staging.
import { expect, it } from 'vitest';
import { consoleCounts, onAdmin, onLogin, pageProblems, scrub } from './admin-session-e2e.mjs';

it('a 5xx or the error screen is a problem; a normal page is not', () => {
  expect(pageProblems('2 sign in', 200, 'Products 0 items')).toEqual([]);
  expect(pageProblems('3 refresh', 502, 'x')).toEqual(['3 refresh: answered 502']);
  expect(pageProblems('2 sign in', 200, 'This page couldn’t load A server error occurred.')).toEqual(['2 sign in: shows the error screen']);
});

it('tells the sign-in page from a signed-in admin page', () => {
  expect(onLogin('https://x.test/admin/login?next=%2Fadmin%2Fproducts')).toBe(true);
  expect(onAdmin('https://x.test/admin/login')).toBe(false);
  expect(onAdmin('https://x.test/admin/products')).toBe(true);
  expect(onAdmin('https://x.test/admin')).toBe(true);
  expect(onAdmin('https://x.test/administrator')).toBe(false);
  expect(onAdmin('https://x.test/status')).toBe(false);
});

it('a 401 note counts only after signing in', () => {
  expect(consoleCounts('Failed to load resource: the server responded with a status of 401 ()', false)).toBe(false);
  expect(consoleCounts('Failed to load resource: the server responded with a status of 401 ()', true)).toBe(true);
  expect(consoleCounts('TypeError: x is undefined', false)).toBe(true);
});

it('never prints a secret, an e-mail or an address', () => {
  expect(scrub('bad pw S3cret! for owner@example.test from 10.1.2.3', ['S3cret!'])).toBe('bad pw <hidden> for <e-mail> from <ip>');
});
