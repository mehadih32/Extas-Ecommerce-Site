// PR 169 — the card and bank gateway (SSLCommerz) behind the payment gateway contract, against a fake SSLCommerz (no
// network): the session opened with the amount in taka, our transaction id and our signed callback on every return
// address; only the transaction query's VALID answer counts as paid (never the page the customer came back on); a
// strange transaction id is refused before any call; refusals, outages and broken answers are stable errors; card types
// and "Pay online" run on this gateway; the Test button and the practice gateway. Every key and value is made up.
import { describe, expect, it } from 'vitest';
import { checkCallbackSignature, createSslcommerzGateway, gatewayProviderOf, mockCallback, signedCallbackUrl, sslcommerzAdapter, sslcommerzAmount, sslcommerzTranId, type FetchLike } from '../src';

const PID = '0192a0b0-0000-7000-8000-000000000169';
const BASE = 'https://shop.example.test/api/payments/callback/visa';
const KEYS = { baseUrl: 'https://sandbox.sslcommerz.example.test/', storeId: 'sample-store', storePassword: 'sample-password@ssl', contactEmail: 'shop@example.test' };
const START = { paymentId: PID, idempotencyKey: 'order-key:pay:1', orderNumber: 'S-1', amountMinor: 176_050, currency: 'BDT', payerReference: '01711000000', callbackBaseUrl: BASE };
const TRAN = sslcommerzTranId('order-key:pay:1');

function fakeSsl(rows: (tran: string) => unknown[] | { APIConnect: string }) {
  const calls: { method: string; path: string; query: Record<string, string>; form: Record<string, string> | null }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    const form = init.body ? Object.fromEntries(new URLSearchParams(String(init.body)).entries()) : null;
    calls.push({ method: String(init.method), path: u.pathname, query: Object.fromEntries(u.searchParams.entries()), form });
    const json = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname === '/gwprocess/v4/api.php') return form?.store_passwd === KEYS.storePassword ? json({ status: 'SUCCESS', GatewayPageURL: 'https://sandbox.sslcommerz.example.test/pay/abc', sessionkey: 'abc' }) : json({ status: 'FAILED', failedreason: 'Store Credential Error Or Store is De-active' });
    if (u.pathname === '/validator/api/merchantTransIDvalidationAPI.php') {
      const r = rows(u.searchParams.get('tran_id')!);
      return json(Array.isArray(r) ? { APIConnect: 'DONE', no_of_trans_found: r.length, element: r } : r);
    }
    return new Response('{}', { status: 404 });
  };
  return { calls, fetch };
}

describe('PR 169 · the card and bank gateway (SSLCommerz)', () => {
  it('opens a session: the amount in taka, our transaction id, our signed callback on every return address', async () => {
    const s = fakeSsl(() => []);
    const g = createSslcommerzGateway({ ...KEYS, fetch: s.fetch });
    expect(await g.initiate(START)).toEqual({ providerRef: TRAN, redirectUrl: 'https://sandbox.sslcommerz.example.test/pay/abc', expiresAt: null });
    expect(TRAN).toMatch(/^EX[0-9A-F]{28}$/);
    expect(sslcommerzTranId('order-key:pay:1')).toBe(TRAN);
    const form = s.calls[0]!.form!;
    expect(form).toMatchObject({ store_id: 'sample-store', total_amount: '1760.50', currency: 'BDT', tran_id: TRAN, cus_email: 'shop@example.test', cus_phone: '01711000000' });
    for (const [field, outcome] of [['success_url', 'success'], ['fail_url', 'failure'], ['cancel_url', 'cancel'], ['ipn_url', undefined]] as const) {
      const q = Object.fromEntries(new URL(form[field]!).searchParams.entries());
      expect(checkCallbackSignature(KEYS.storePassword, 'sslcommerz', q)).toEqual({ ok: true, paymentId: PID });
      expect(q.outcome).toBe(outcome);
    }
    expect(sslcommerzAmount(5)).toBe('0.05');
    const refused = createSslcommerzGateway({ ...KEYS, storePassword: 'wrong', fetch: s.fetch });
    await expect(refused.initiate(START)).rejects.toMatchObject({ code: 'REJECTED', message: expect.stringContaining('De-active') });
  });

  it('only the transaction query decides; a VALID payment of this transaction is paid, whatever page the customer saw', async () => {
    const s = fakeSsl((tran) =>
      tran === TRAN
        ? [
            { tran_id: TRAN, status: 'FAILED', amount: '1760.50' },
            { tran_id: TRAN, status: 'VALID', val_id: 'VAL1', bank_tran_id: 'BANK77', amount: '1760.50', currency: 'BDT' },
          ]
        : tran === sslcommerzTranId('k2')
          ? [{ tran_id: tran, status: 'CANCELLED' }]
          : [],
    );
    const g = createSslcommerzGateway({ ...KEYS, fetch: s.fetch });
    const signed = Object.fromEntries(new URL(signedCallbackUrl(KEYS.storePassword, 'sslcommerz', BASE, PID)).searchParams.entries());
    // the browser came back on the fail page, SSLCommerz posting status=FAILED: still asked, and it says paid
    const read = g.readCallback({ params: { ...signed, outcome: 'failure', tran_id: TRAN, status: 'FAILED', val_id: 'VAL1' } });
    expect(read).toEqual({ ok: true, paymentId: PID, providerRef: TRAN, claim: 'failure', eventKey: `${TRAN}:failure:VAL1` });
    expect(await g.confirm(read as Extract<typeof read, { ok: true }>)).toEqual({ state: 'PAID', providerRef: TRAN, providerTrxId: 'BANK77', amountMinor: 176_050, currency: 'BDT', failureCode: null });
    expect(s.calls.at(-1)!.query).toMatchObject({ tran_id: TRAN, store_id: 'sample-store', format: 'json' });
    // the IPN (no outcome): its own status is the hint
    expect(g.readCallback({ params: { ...signed, tran_id: TRAN, status: 'VALID', val_id: 'VAL1' } })).toMatchObject({ ok: true, claim: 'success' });
    const at = (ref: string, claim: 'success' | 'failure' | 'cancel') => ({ ok: true as const, paymentId: PID, providerRef: ref, claim, eventKey: ref });
    expect(await g.confirm(at(sslcommerzTranId('k2'), 'success'))).toMatchObject({ state: 'CANCELLED', failureCode: 'CANCELLED' });
    expect(await g.confirm(at(sslcommerzTranId('k3'), 'success'))).toMatchObject({ state: 'PENDING', providerTrxId: null });
    expect(await g.confirm(at(sslcommerzTranId('k3'), 'cancel'))).toMatchObject({ state: 'CANCELLED', failureCode: 'CUSTOMER_CANCELLED' });
    // forged, the practice gateway's, a strange transaction id or no hint: refused before any call
    const before = s.calls.length;
    expect(g.readCallback({ params: { ...signed, pid: PID.replace('169', '168'), tran_id: TRAN, outcome: 'success' } })).toEqual({ ok: false, reason: 'mismatch' });
    expect(g.readCallback({ params: mockCallback('sslcommerz', BASE, PID, 'success') })).toEqual({ ok: false, reason: 'mismatch' });
    expect(g.readCallback({ params: { ...signed, tran_id: 'other', outcome: 'success' } })).toEqual({ ok: false, reason: 'malformed' });
    expect(g.readCallback({ params: { ...signed, tran_id: TRAN, status: 'PENDING' } })).toEqual({ ok: false, reason: 'malformed' });
    await expect(g.query('../x')).rejects.toMatchObject({ code: 'BAD_ANSWER' });
    expect(s.calls.length).toBe(before);
  });

  it('refusals, outages and broken answers are stable errors; card types and Pay online use this gateway; the Test', async () => {
    const inactive = createSslcommerzGateway({ ...KEYS, fetch: fakeSsl(() => ({ APIConnect: 'INACTIVE' })).fetch });
    await expect(inactive.query(TRAN)).rejects.toMatchObject({ code: 'REJECTED' });
    const odd = createSslcommerzGateway({ ...KEYS, fetch: fakeSsl(() => ({ APIConnect: 'FAILED' })).fetch });
    await expect(odd.query(TRAN)).rejects.toMatchObject({ code: 'BAD_ANSWER' });
    const down = createSslcommerzGateway({ ...KEYS, fetch: async () => new Response('{}', { status: 503 }) });
    await expect(down.query(TRAN)).rejects.toMatchObject({ code: 'UNREACHABLE', retryable: true });
    const offline = createSslcommerzGateway({ ...KEYS, fetch: async () => { throw new TypeError('fetch failed'); } });
    await expect(offline.query(TRAN)).rejects.toMatchObject({ code: 'UNREACHABLE' });
    const noJson = createSslcommerzGateway({ ...KEYS, fetch: async () => new Response('<html>', { status: 200 }) });
    await expect(noJson.query(TRAN)).rejects.toMatchObject({ code: 'BAD_ANSWER' });

    for (const p of ['visa', 'mastercard', 'amex', 'bank', 'online']) expect(gatewayProviderOf(p)).toBe('sslcommerz');
    expect(gatewayProviderOf('bkash')).toBe('bkash');
    expect(gatewayProviderOf('rocket')).toBe('rocket');

    const config = { baseUrl: KEYS.baseUrl, storeId: KEYS.storeId, contactEmail: KEYS.contactEmail };
    const ctx = (mode: 'MOCK' | 'LIVE', secret: (f: string) => Promise<string | null>) => ({ mode, config, storeId: null, secret });
    await expect(sslcommerzAdapter.create(ctx('LIVE', async () => null))).rejects.toThrow(/not entered yet/);
    const mock = await sslcommerzAdapter.mock(ctx('MOCK', async () => null));
    expect(await sslcommerzAdapter.test(mock, ctx('MOCK', async () => null))).toEqual({ ok: true, message: expect.stringMatching(/practice/) });
    expect(await sslcommerzAdapter.test(inactive, ctx('LIVE', async () => 'x'))).toMatchObject({ ok: false });
    const fine = createSslcommerzGateway({ ...KEYS, fetch: fakeSsl(() => []).fetch });
    expect(await sslcommerzAdapter.test(fine, ctx('LIVE', async () => 'x'))).toMatchObject({ ok: true });
    expect(sslcommerzAdapter.configSchema.safeParse({ ...config, baseUrl: 'http://ssl.example.test' }).success).toBe(false);
    expect(sslcommerzAdapter.configSchema.safeParse({ ...config, contactEmail: 'not-mail' }).success).toBe(false);
  });
});
