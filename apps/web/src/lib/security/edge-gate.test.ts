// S18 · PR 378 — the gate in front of every API call: a cross-site change is refused unless the caller proves itself
// another way; the per-address limits only log in `observe`, refuse with a retry time in `enforce`, and count nothing
// while `off` or before the settings were read; the admin's own calls are never counted; the page policy header is
// report-only until the owner turns it on.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { addressTag, apiGate, needsSameOrigin, pageCspHeader, RateCounter, rateBucketOf, type EdgePolicy, type GateRequest } from './edge-gate';

const H = (h: Record<string, string>) => new Headers(h);
const req = (method: string, path: string, h: Record<string, string> = {}): GateRequest => ({
  method,
  path,
  url: `https://shop.example.test${path}`,
  headers: H({ host: 'shop.example.test', 'cf-connecting-ip': '203.0.113.7', ...h }),
});
const policy = (mode: EdgePolicy['rate']['mode'], perMinute: Partial<EdgePolicy['rate']['perMinute']> = {}): EdgePolicy => ({
  csp: { mode: 'report', header: "default-src 'self'" },
  rate: { mode, perMinute: { ...registry['security.rateLimit.perMinute'].default, ...perMinute }, maxTracked: 1000 },
});

describe('cross-site check', () => {
  it('refuses a cross-site or origin-less change, passes a same-site one and every read', () => {
    expect(apiGate(req('POST', '/api/bag/lines', { 'sec-fetch-site': 'cross-site' }), { policy: null })).toMatchObject({ kind: 'refuse', status: 403, error: 'cross-site-request' });
    expect(apiGate(req('POST', '/api/bag/lines'), { policy: null })).toMatchObject({ kind: 'refuse', status: 403 });
    expect(apiGate(req('DELETE', '/api/admin/staff/1', { origin: 'https://evil.example' }), { policy: null })).toMatchObject({ kind: 'refuse' });
    expect(apiGate(req('POST', '/api/bag/lines', { 'sec-fetch-site': 'same-origin' }), { policy: null })).toEqual({ kind: 'pass' });
    expect(apiGate(req('POST', '/api/bag/lines', { origin: 'https://shop.example.test' }), { policy: null })).toEqual({ kind: 'pass' });
    expect(apiGate(req('GET', '/api/delivery/suggest', { 'sec-fetch-site': 'cross-site' }), { policy: null })).toEqual({ kind: 'pass' });
  });

  it('a same-site sibling (another subdomain) is not this site', () => {
    expect(apiGate(req('POST', '/api/checkout/orders', { 'sec-fetch-site': 'same-site' }), { policy: null })).toMatchObject({ kind: 'refuse' });
  });

  it('only the callers that prove themselves another way pass without it', () => {
    for (const p of ['/api/erp/webhook', '/api/whatsapp/webhook', '/api/messenger/webhook', '/api/payments/callback/bkash', '/api/internal/cache/deployed', '/erp-api/customers', '/api/security/csp-report']) {
      expect(needsSameOrigin('POST', p), p).toBe(false);
      expect(apiGate(req('POST', p), { policy: null }), p).toEqual({ kind: 'pass' });
    }
    for (const p of ['/api/erp/webhookx', '/api/payments/callbackx', '/api/internalx', '/api/security/csp-reportx', '/api/account/login']) {
      expect(needsSameOrigin('POST', p), p).toBe(true);
    }
  });
});

describe('request kinds', () => {
  it('sorts each call into its limit; the admin is never counted except its sign-in steps', () => {
    expect(rateBucketOf('POST', '/api/account/login')).toBe('signIn');
    expect(rateBucketOf('POST', '/api/account/code')).toBe('signIn');
    expect(rateBucketOf('POST', '/api/account/review')).toBe('shopWrite');
    expect(rateBucketOf('POST', '/api/admin/auth/login')).toBe('signIn');
    expect(rateBucketOf('POST', '/api/admin/auth/2fa')).toBe('signIn');
    expect(rateBucketOf('POST', '/api/admin/orders/1/confirm')).toBeNull();
    expect(rateBucketOf('POST', '/api/checkout/orders')).toBe('checkout');
    expect(rateBucketOf('POST', '/api/pay/link')).toBe('checkout');
    expect(rateBucketOf('PATCH', '/api/bag/lines/x')).toBe('shopWrite');
    expect(rateBucketOf('POST', '/api/shop/vitals')).toBe('report'); // PR 234: the speed readings
    expect(rateBucketOf('GET', '/api/bag/lines')).toBeNull();
    expect(rateBucketOf('POST', '/api/security/csp-report')).toBe('report');
    expect(rateBucketOf('POST', '/api/erp/webhook')).toBe('webhook');
    expect(rateBucketOf('GET', '/api/whatsapp/webhook')).toBe('webhook');
    expect(rateBucketOf('POST', '/api/messenger/webhook')).toBe('webhook');
    expect(rateBucketOf('POST', '/api/shop/support-chat')).toBe('shopWrite');
    expect(rateBucketOf('POST', '/erp-api/customers')).toBe('webhook');
    expect(rateBucketOf('POST', '/api/internal/cache/deployed')).toBeNull();
  });
});

describe('per-address limits', () => {
  const ok = { 'sec-fetch-site': 'same-origin' };

  it('observe (the default) only logs once a minute per address, never refuses', () => {
    const counter = new RateCounter();
    const lines: string[] = [];
    const p = policy('observe', { signIn: 2 });
    const answers = [0, 1, 2, 3, 4].map(() => apiGate(req('POST', '/api/account/login', ok), { policy: p, now: 1_000, counter, log: (l) => lines.push(l) }));
    expect(answers.every((a) => a.kind === 'pass')).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('signIn over 2/min');
    expect(lines[0]).not.toContain('203.0.113.7'); // a tag, never the address
    expect(lines[0]).toContain(addressTag('203.0.113.7'));
  });

  it('enforce refuses over the limit with the seconds left in the minute, and resumes when the minute ends', () => {
    const counter = new RateCounter();
    const p = policy('enforce', { checkout: 2 });
    const at = (now: number) => apiGate(req('POST', '/api/checkout/orders', ok), { policy: p, now, counter, log: () => {} });
    expect(at(10_000).kind).toBe('pass');
    expect(at(10_000).kind).toBe('pass');
    expect(at(25_000)).toEqual({ kind: 'refuse', status: 429, error: 'RATE_LIMITED', retryAfterSeconds: 45 });
    expect(at(70_000).kind).toBe('pass'); // a new minute
  });

  it('counts each address on its own, and nothing while off or before the settings were read', () => {
    const counter = new RateCounter();
    const p = policy('enforce', { shopWrite: 1 });
    const from = (ip: string) => apiGate({ ...req('POST', '/api/wishlist', ok), headers: H({ host: 'shop.example.test', 'cf-connecting-ip': ip, ...ok }) }, { policy: p, now: 0, counter, log: () => {} });
    expect(from('198.51.100.1').kind).toBe('pass');
    expect(from('198.51.100.2').kind).toBe('pass');
    expect(from('198.51.100.1').kind).toBe('refuse');
    for (const none of [policy('off', { shopWrite: 1 }), null]) {
      const c = new RateCounter();
      for (let i = 0; i < 5; i++) expect(apiGate(req('POST', '/api/wishlist', ok), { policy: none, now: 0, counter: c }).kind).toBe('pass');
      expect(c.size).toBe(0);
    }
  });

  it('keeps at most maxTracked addresses, dropping the oldest', () => {
    const c = new RateCounter();
    for (let i = 0; i < 50; i++) c.hit(`k${i}`, 0, 20);
    expect(c.size).toBeLessThanOrEqual(21);
  });
});

describe('page policy header', () => {
  it('report-only by default, enforced only when the owner says, none when off or not read', () => {
    expect(pageCspHeader(policy('observe'))).toEqual({ name: 'content-security-policy-report-only', value: "default-src 'self'" });
    expect(pageCspHeader({ ...policy('observe'), csp: { mode: 'enforce', header: 'x' } })?.name).toBe('content-security-policy');
    expect(pageCspHeader({ ...policy('observe'), csp: { mode: 'off', header: null } })).toBeNull();
    expect(pageCspHeader(null)).toBeNull();
  });
});
