// PR 130 — the account API's door: same site only, POST only, small bodies, a database; where it may send him after
// signing in; the CI-only test code route is closed elsewhere; the cookies are httpOnly, Secure and Lax.
import { afterEach, describe, expect, it } from 'vitest';
import { accountCookie, clearAccountCookie, CUSTOMER_COOKIE } from './account';
import { accountHandler, safeNext, type AccountApiDeps } from './account-api';

const req = (init: RequestInit & { site?: string } = {}) =>
  new Request('http://shop.test/api/account/code', {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': init.site ?? 'same-origin', ...(init.headers as Record<string, string>) },
    body: init.method === 'GET' ? undefined : (init.body ?? '{}'),
  });

const fake = {} as AccountApiDeps;

describe('PR 130 · the account API door', () => {
  afterEach(() => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
  });

  it('refuses another site, another method, a big body and a missing database', async () => {
    expect((await accountHandler(req({ site: 'cross-site' }), fake, 'code')).status).toBe(403);
    expect((await accountHandler(req({ method: 'GET' }), fake, 'code')).status).toBe(405);
    expect((await accountHandler(req({ headers: { 'content-length': '99999' } }), fake, 'code')).status).toBe(413);
    expect((await accountHandler(req(), null, 'code')).status).toBe(503);
  });

  it('the test-code route is not there unless the test server says so', async () => {
    const r = await accountHandler(req({ body: JSON.stringify({ phone: '01700-000130' }) }), { accounts: {} as never, storeId: 1, storeName: async () => '' }, 'test-code');
    expect(r.status).toBe(404);
  });

  it('after signing in he goes back to a page of this shop, never elsewhere or to the login page', () => {
    expect(safeNext('/checkout', 'en')).toBe('/checkout');
    expect(safeNext('/bn/account/orders', 'bn')).toBe('/bn/account/orders');
    expect(safeNext('//evil.example/x', 'en')).toBe('/account');
    expect(safeNext('https://evil.example', 'en')).toBe('/account');
    expect(safeNext('/account/login?next=/x', 'bn')).toBe('/bn/account');
    expect(safeNext('/a"onmouseover=x', 'en')).toBe('/account');
    expect(safeNext(undefined, 'en')).toBe('/account');
  });

  it('the session cookie is httpOnly, Secure, SameSite=Lax (a link from an SMS opens the account), and clears', () => {
    const c = accountCookie(CUSTOMER_COOKIE, 'tok', new Date(Date.now() + 60_000));
    expect(c).toMatch(/^__Host-extas_c=tok; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=(59|60)$/);
    expect(clearAccountCookie(CUSTOMER_COOKIE)).toContain('Max-Age=0');
  });
});
