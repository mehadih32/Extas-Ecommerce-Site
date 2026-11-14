// CN-053 (14 Nov 2026) — the staff sign-in is at /access; /admin/login does not exist for visitors; an /admin page asked for
// without an admin session cookie is a plain 404; a dead admin cookie is expired on /access (that one cookie only); a
// customer's dead cookie on the shop's sign-in page likewise; one of our cookies grown too big is expired on any answer.
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('./lib/seo/redirect-table', () => ({ redirectTable: async () => ({}), forwardOf: () => null, countRedirectHit: () => {} }));
vi.mock('./lib/seo/bengali-gate', () => ({ bengaliGateSends: async () => false }));
vi.mock('./lib/shop/store-id', () => ({ shopStoreId: () => 1 }));
vi.mock('./lib/shop/unknown-address', async (orig) => {
  const real = await orig<typeof import('./lib/shop/unknown-address')>();
  return { ...real, unknownAddressNow: async (_s: number, path: string) => real.unknownAddress(path, '/p') };
});
const stale = { admin: null as string | null, customer: null as string | null };
vi.mock('./lib/admin-stale-cookie', () => ({ staleSessionCookieLine: async () => stale.admin }));
vi.mock('./lib/shop/stale-cookie', () => ({ staleCustomerCookieLine: async () => stale.customer }));

const { proxy } = await import('./proxy');
const { rewriteMark } = await import('./lib/shop/rewrite-mark');

const BASE = 'http://127.0.0.1:3000';
const SID = '__Host-admin_sid';
const rewrittenTo = (res: Response) => (res.headers.get('x-middleware-rewrite') ? new URL(res.headers.get('x-middleware-rewrite')!).pathname : null);
const setCookies = (res: Response) => res.headers.getSetCookie();
const withCookie = (path: string, cookie: string, init: { headers?: Record<string, string> } = {}) => new NextRequest(`${BASE}${path}`, { headers: { cookie, ...(init.headers ?? {}) } });

describe('the admin sign-in address (CN-053)', () => {
  it('/access serves the sign-in page (rewritten to its folder, never kept by a cache)', async () => {
    const res = await proxy(new NextRequest(`${BASE}/access?next=/admin/orders`));
    expect(rewrittenTo(res)).toBe('/admin/login');
    expect(new URL(res.headers.get('x-middleware-rewrite')!).search).toBe('?next=/admin/orders');
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(res.status).toBe(200);
  });

  it('/admin/login answers 404 with no redirect and no hint', async () => {
    for (const path of ['/admin/login', '/admin/login/x', '/admin/login?next=/admin']) {
      const res = await proxy(new NextRequest(`${BASE}${path}`));
      expect(res.status, path).toBe(404);
      expect(res.headers.get('location'), path).toBeNull();
      expect(rewrittenTo(res), path).toBe('/admin/missing');
    }
    // even a signed-in browser cannot open the folder directly
    expect((await proxy(withCookie('/admin/login', `${SID}=abc`))).status).toBe(404);
  });

  it('an /admin page asked for without a session cookie is a 404; with one it goes on as before', async () => {
    for (const path of ['/admin', '/admin/orders', '/admin/settings/anything']) {
      const res = await proxy(new NextRequest(`${BASE}${path}`));
      expect(res.status, path).toBe(404);
      expect(res.headers.get('location'), path).toBeNull();
    }
    const ok = await proxy(withCookie('/admin/orders', `${SID}=abc`));
    expect(ok.status).toBe(200);
    expect(rewrittenTo(ok)).toBeNull();
    expect(ok.headers.get('cache-control')).toMatch(/no-store/);
  });

  it('the proxy\'s own rewrite seen again (it carries the mark) is not hidden again', async () => {
    const res = await proxy(new NextRequest(`${BASE}/admin/login`, { headers: { 'x-extas-rewrite': rewriteMark() } }));
    expect(res.status).toBe(200);
    expect(rewrittenTo(res)).toBeNull();
    // a wrong mark is a visitor guessing
    expect((await proxy(new NextRequest(`${BASE}/admin/login`, { headers: { 'x-extas-rewrite': '0000' } }))).status).toBe(404);
  });

  it('a dead admin session cookie is expired on /access: that cookie only, Path=/, Secure, Max-Age=0', async () => {
    stale.admin = `${SID}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
    const res = await proxy(withCookie('/access', `${SID}=dead; extas_bag=keep; __Host-extas_c=keep`));
    const lines = setCookies(res).filter((l) => l.startsWith(`${SID}=`));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Path=\/;/);
    expect(lines[0]).toMatch(/Secure/);
    expect(lines[0]).toMatch(/Max-Age=0/);
    expect(setCookies(res).filter((l) => !l.startsWith(`${SID}=`))).toEqual([]);
    expect(res.headers.get('clear-site-data')).toBeNull();
  });

  it('a good session cookie, or none, is left alone on /access', async () => {
    stale.admin = null;
    expect(setCookies(await proxy(withCookie('/access', `${SID}=good`)))).toEqual([]);
    expect(setCookies(await proxy(new NextRequest(`${BASE}/access`)))).toEqual([]);
  });

  it('the shop\'s sign-in page expires a dead customer cookie, and only that', async () => {
    stale.customer = '__Host-extas_c=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
    const res = await proxy(withCookie('/account/login', '__Host-extas_c=dead; __Host-extas_bag=keep'));
    expect(setCookies(res)).toEqual([stale.customer]);
    stale.customer = null;
    expect(setCookies(await proxy(withCookie('/account/login', '__Host-extas_c=good')))).toEqual([]);
  });

  it('one of our cookies grown too big is expired, whatever page is asked for; other sites\' cookies are never touched', async () => {
    const big = `extas_big=${'x'.repeat(3000)}`;
    for (const path of ['/', '/access', '/admin/orders', '/api/health']) {
      const res = await proxy(withCookie(path, `${big}; ${SID}=a; theirs_big=${'y'.repeat(3000)}`));
      const lines = setCookies(res);
      expect(lines.some((l) => l.startsWith('extas_big=;') && /Max-Age=0/.test(l)), path).toBe(true);
      expect(lines.some((l) => l.startsWith('theirs_big=')), path).toBe(false);
      expect(lines.some((l) => l.startsWith(`${SID}=;`) && !path.startsWith('/access')), path).toBe(false);
    }
  });
});
