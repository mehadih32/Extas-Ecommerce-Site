import { describe, expect, it } from 'vitest';
import { clearCookie, guardAdmin, readCookie, requestContext, sameOrigin, setCookie } from './admin-auth';

const req = (method: string, headers: Record<string, string> = {}) => new Request('http://shop.example.test/api/admin/x', { method, headers });

describe('admin cookies', () => {
  it('are httpOnly, Secure, SameSite=Strict, host-only, with an end', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    const c = setCookie('__Host-admin_sid', 'tok', new Date(now.getTime() + 3_600_000), now);
    expect(c).toMatch(/^__Host-admin_sid=tok; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Expires=/);
    expect(c).not.toMatch(/Domain=/i);
    expect(clearCookie('__Host-admin_sid')).toContain('Max-Age=0');
  });

  it('reads one cookie out of the header', () => {
    expect(readCookie(req('GET', { cookie: 'a=1; __Host-admin_sid=abc; b=2' }), '__Host-admin_sid')).toBe('abc');
    expect(readCookie(req('GET'), '__Host-admin_sid')).toBeNull();
  });
});

describe('same-origin check on every state change (CSRF)', () => {
  it('lets reads through', () => {
    expect(sameOrigin(req('GET'))).toBe(true);
  });

  it('trusts Fetch Metadata first, then the Origin header; refuses a request with neither', () => {
    expect(sameOrigin(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(sameOrigin(req('POST', { 'sec-fetch-site': 'cross-site', origin: 'http://shop.example.test' }))).toBe(false);
    expect(sameOrigin(req('POST', { origin: 'http://shop.example.test', host: 'shop.example.test' }))).toBe(true);
    expect(sameOrigin(req('POST', { origin: 'https://evil.example.test', host: 'shop.example.test' }))).toBe(false);
    expect(sameOrigin(req('POST'))).toBe(false);
  });
});

describe('request context', () => {
  it('takes the client address from Cloudflare, then the proxy', () => {
    expect(requestContext(req('GET', { 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '10.0.0.1' })).ip).toBe('198.51.100.7');
    expect(requestContext(req('GET', { 'x-forwarded-for': '198.51.100.8, 10.0.0.1' })).ip).toBe('198.51.100.8');
    expect(requestContext(req('GET', { 'user-agent': 'SampleBrowser/1.0' })).userAgent).toBe('SampleBrowser/1.0');
  });
});

describe('guard without a database', () => {
  it('answers 503 (CI and next build have no database)', async () => {
    const r = await guardAdmin(req('GET'), null);
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(503);
  });
});
