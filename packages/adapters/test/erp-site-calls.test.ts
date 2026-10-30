// PR 620 (CN-028, docs/erp/site-changes-v6.md §2.7) — the ERP's own calls to the shop (`GET /erp-api/top-products`,
// `GET /erp-api/customers`): signed like the webhooks, but over `METHOD\nPATH?QUERY\nTIMESTAMP` (the requests have no
// body), so a signature works only for that exact request and that moment. Every secret here is made up.
import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ERP_LINK_SECRET_FIELDS } from '@extas/erp-types';
import { connectionCatalogue, ERP_SIGNATURE_HEADER, ERP_TIMESTAMP_HEADER, erpRequestText, erpSignatureShape, extasErp, signedErpSiteCall, signErpRequest, verifyErpRequest } from '../src';

const T0 = new Date('2026-10-23T04:00:00Z');
const secs = (d: Date) => String(Math.floor(d.getTime() / 1000));

describe('PR 620 · the ERP signs its calls to the shop', () => {
  const secret = randomBytes(24).toString('hex');
  const path = '/erp-api/customers?page=1&pageSize=50';

  it('the signed text is the method, the path with its query, and the timestamp, one per line (the contract example)', () => {
    expect(erpRequestText('GET', '/erp-api/customers?page=1&pageSize=50', '1793606400')).toBe('GET\n/erp-api/customers?page=1&pageSize=50\n1793606400');
    expect(erpRequestText('get', '/erp-api/top-products', '1793606400')).toBe('GET\n/erp-api/top-products\n1793606400');
    const want = 'sha256=' + createHmac('sha256', secret).update('GET\n/erp-api/customers?page=1&pageSize=50\n1793606400').digest('hex');
    expect(signErpRequest(secret, 'GET', path, '1793606400')).toBe(want);
  });

  it('verifies only that request at that moment, with that secret; constant-time and refused when 5 minutes off', () => {
    const now = T0.getTime();
    const ok = { secret, method: 'GET', pathAndQuery: path, signature: signErpRequest(secret, 'GET', path, secs(T0)), timestamp: secs(T0), maxAgeSeconds: 300, now };
    expect(verifyErpRequest(ok)).toEqual({ ok: true });
    // Another page, another path, another method, another secret: the same signature is worth nothing.
    expect(verifyErpRequest({ ...ok, pathAndQuery: '/erp-api/customers?page=2&pageSize=50' })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyErpRequest({ ...ok, pathAndQuery: '/erp-api/top-products?page=1&pageSize=50' })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyErpRequest({ ...ok, method: 'POST' })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyErpRequest({ ...ok, secret: secret + 'x' })).toEqual({ ok: false, reason: 'mismatch' });
    // The timestamp is part of the text: changing it breaks the signature, and more than 5 minutes either way is stale.
    expect(verifyErpRequest({ ...ok, timestamp: String(Number(secs(T0)) + 1) })).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyErpRequest({ ...ok, now: now + 301_000 })).toEqual({ ok: false, reason: 'stale' });
    expect(verifyErpRequest({ ...ok, now: now - 301_000 })).toEqual({ ok: false, reason: 'stale' });
    expect(verifyErpRequest({ ...ok, now: now + 299_000 })).toEqual({ ok: true });
    expect(verifyErpRequest({ ...ok, signature: null })).toEqual({ ok: false, reason: 'missing' });
    expect(verifyErpRequest({ ...ok, timestamp: undefined })).toEqual({ ok: false, reason: 'missing' });
    expect(verifyErpRequest({ ...ok, signature: 'sha256=abc' })).toEqual({ ok: false, reason: 'malformed' });
    expect(verifyErpRequest({ ...ok, timestamp: 'soon' })).toEqual({ ok: false, reason: 'malformed' });
  });

  it('qa-gate: the headers can be judged without any secret (missing, or never a signature)', () => {
    const h = signedErpSiteCall(secret, 'GET', path, T0).headers;
    expect(erpSignatureShape(h[ERP_SIGNATURE_HEADER], h[ERP_TIMESTAMP_HEADER])).toEqual({ ok: true });
    expect(erpSignatureShape(null, h[ERP_TIMESTAMP_HEADER])).toEqual({ ok: false, reason: 'missing' });
    expect(erpSignatureShape(h[ERP_SIGNATURE_HEADER], '')).toEqual({ ok: false, reason: 'missing' });
    expect(erpSignatureShape('sha256=' + 'a'.repeat(63), h[ERP_TIMESTAMP_HEADER])).toEqual({ ok: false, reason: 'malformed' });
    expect(erpSignatureShape('sha1=' + 'a'.repeat(64), h[ERP_TIMESTAMP_HEADER])).toEqual({ ok: false, reason: 'malformed' });
    expect(erpSignatureShape(h[ERP_SIGNATURE_HEADER], 'soon')).toEqual({ ok: false, reason: 'malformed' });
    expect(erpSignatureShape(h[ERP_SIGNATURE_HEADER], '2026-10-23T04:00:00Z')).toEqual({ ok: true });
    // With the allowed age and the clock, a well-formed but stale timestamp is refused too (still no secret needed).
    const at = { maxAgeSeconds: 300, now: T0.getTime() };
    expect(erpSignatureShape(h[ERP_SIGNATURE_HEADER], h[ERP_TIMESTAMP_HEADER], at)).toEqual({ ok: true });
    expect(erpSignatureShape(h[ERP_SIGNATURE_HEADER], secs(new Date(T0.getTime() - 301_000)), at)).toEqual({ ok: false, reason: 'stale' });
    expect(erpSignatureShape(h[ERP_SIGNATURE_HEADER], secs(new Date(T0.getTime() + 301_000)), at)).toEqual({ ok: false, reason: 'stale' });
  });

  it('a signed call as the ERP makes it: the two headers, timestamp in seconds', () => {
    const c = signedErpSiteCall(secret, 'GET', path, T0);
    expect(c.headers[ERP_TIMESTAMP_HEADER]).toBe(secs(T0));
    expect(verifyErpRequest({ secret, method: 'GET', pathAndQuery: path, signature: c.headers[ERP_SIGNATURE_HEADER], timestamp: c.headers[ERP_TIMESTAMP_HEADER], maxAgeSeconds: 300, now: T0.getTime() })).toEqual({ ok: true });
  });

  it('the ERP connection has a third, optional key: the signing secret (empty = the webhook secret signs the calls)', () => {
    expect(extasErp.secrets).toEqual([...ERP_LINK_SECRET_FIELDS]);
    const row = connectionCatalogue.find((c) => c.id === 'extasErp')!;
    expect(row.secrets).toEqual([{ field: 'apiKey' }, { field: 'webhookSecret' }, { field: 'signingSecret', optional: true }]);
  });
});
