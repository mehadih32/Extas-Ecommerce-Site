// PR 168 — Nagad's check-out behind the payment gateway contract, against a fake Nagad (no network) that holds its own
// key pair and checks the merchant's signature the way Nagad does: initialize with the encrypted, signed merchant data,
// complete with the amount in taka and our signed callback, the browser sent to Nagad's address; only Nagad's verify
// answer is trusted on the way back; refusals, outages and broken answers are stable errors; keys pasted as a bare
// body or as a PEM on one line both work; the Test button and the practice gateway. Every key and value is made up.
import { constants, createVerify, generateKeyPairSync, privateDecrypt, publicEncrypt, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkCallbackSignature, createNagadGateway, mockCallback, nagadAdapter, nagadAmount, nagadDateTime, nagadOrderId, nagadPem, signedCallbackUrl, type FetchLike } from '../src';

const PID = '0192a0b0-0000-7000-8000-000000000168';
const BASE = 'https://shop.example.test/api/payments/callback/nagad';

const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
const merchant = pair();
const nagad = pair();
/** A key as Nagad hands it out: the base64 body only. */
const bare = (k: KeyObject, type: 'pkcs8' | 'spki') => (k.export({ format: 'pem', type }) as string).replace(/-----[A-Z ]+-----|\s/g, '');
const KEYS = {
  baseUrl: 'https://sandbox.nagad.example.test/remote-payment-gateway-1.0/',
  merchantId: '683002007104225',
  merchantNumber: '01711000000',
  merchantPrivateKey: bare(merchant.privateKey, 'pkcs8'),
  nagadPublicKey: bare(nagad.publicKey, 'spki'),
};
const dec = (b64: string) => JSON.parse(privateDecrypt({ key: nagad.privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(b64, 'base64')).toString()) as Record<string, string>;
const signedByMerchant = (data: Record<string, string>, sig: string) => createVerify('RSA-SHA256').update(JSON.stringify(data)).verify(merchant.publicKey, Buffer.from(sig, 'base64'));
const toMerchant = (data: unknown) => publicEncrypt({ key: merchant.publicKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(JSON.stringify(data))).toString('base64');

/** A fake Nagad: checks the merchant's signature, answers by path, records every call. */
function fakeNagad(verify: (ref: string) => { status?: number; json: unknown } = () => ({ json: { status: 'Success' } })) {
  const calls: { method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> | null }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const path = new URL(url).pathname.replace('/remote-payment-gateway-1.0', '');
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ method: String(init.method), path, headers: init.headers as Record<string, string>, body });
    const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
    if (path.startsWith('/api/dfs/check-out/initialize/')) {
      const sd = dec(String(body!.sensitiveData));
      if (!signedByMerchant(sd, String(body!.signature))) return json({ reason: 'Invalid signature', message: 'signature' }, 400);
      return json({ sensitiveData: toMerchant({ paymentReferenceId: `REF${sd.orderId}`, challenge: 'nagad-challenge-1', acceptDateTime: sd.datetime }), signature: 'x' });
    }
    if (path.startsWith('/api/dfs/check-out/complete/')) {
      const sd = dec(String(body!.sensitiveData));
      if (!signedByMerchant(sd, String(body!.signature)) || sd.challenge !== 'nagad-challenge-1') return json({ status: 'Failed', message: 'bad challenge' });
      return json({ status: 'Success', callBackUrl: `https://sandbox.nagad.example.test/check-out/${path.split('/').pop()}` });
    }
    if (path.startsWith('/api/dfs/verify/payment/')) {
      const a = verify(path.split('/').pop()!);
      return json(a.json, a.status ?? 200);
    }
    return json({}, 404);
  };
  return { calls, fetch };
}
const START = { paymentId: PID, idempotencyKey: 'order-key:pay:1', orderNumber: 'S-1', amountMinor: 176_050, currency: 'BDT', payerReference: 'S-1', callbackBaseUrl: BASE };

describe('PR 168 · Nagad check-out', () => {
  it('initialize and complete with the merchant’s encrypted, signed data, the amount in taka and our signed callback', async () => {
    const n = fakeNagad();
    const g = createNagadGateway({ ...KEYS, fetch: n.fetch, now: () => new Date('2026-10-31T18:00:00Z') });
    const s = await g.initiate(START);
    const orderId = nagadOrderId('order-key:pay:1');
    expect(orderId).toMatch(/^[A-Z0-9]{20}$/);
    expect(nagadOrderId('order-key:pay:1')).toBe(orderId);
    expect(nagadOrderId('order-key:pay:2')).not.toBe(orderId);
    expect(s).toEqual({ providerRef: `REF${orderId}`, redirectUrl: `https://sandbox.nagad.example.test/check-out/REF${orderId}`, expiresAt: null });
    expect(n.calls.map((c) => [c.method, c.path])).toEqual([
      ['POST', `/api/dfs/check-out/initialize/${KEYS.merchantId}/${orderId}`],
      ['POST', `/api/dfs/check-out/complete/REF${orderId}`],
    ]);
    expect(n.calls[0]!.headers).toMatchObject({ 'X-KM-Api-Version': 'v-0.2.0', 'X-KM-Client-Type': 'PC_WEB' });
    expect(n.calls[0]!.body).toMatchObject({ accountNumber: KEYS.merchantNumber, dateTime: '20261101000000' });
    expect(dec(String(n.calls[0]!.body!.sensitiveData))).toMatchObject({ merchantId: KEYS.merchantId, orderId, datetime: '20261101000000' });
    expect(dec(String(n.calls[1]!.body!.sensitiveData))).toEqual({ merchantId: KEYS.merchantId, orderId, currencyCode: '050', amount: '1760.50', challenge: 'nagad-challenge-1' });
    const cb = Object.fromEntries(new URL(String(n.calls[1]!.body!.merchantCallbackURL)).searchParams.entries());
    expect(checkCallbackSignature(KEYS.merchantPrivateKey, 'nagad', cb)).toEqual({ ok: true, paymentId: PID });
    expect(nagadAmount(5)).toBe('0.05');
    expect(nagadDateTime(new Date('2026-01-01T00:00:00Z'))).toBe('20260101060000');
    await expect(g.initiate({ ...START, currency: 'USD' })).rejects.toMatchObject({ code: 'REJECTED' });
  });

  it('the callback is read from our signed address; only Nagad’s verify decides', async () => {
    const n = fakeNagad((ref) => ({ json: ref === 'REF-PAID' ? { status: 'Success', paymentRefId: 'REF-PAID', issuerPaymentRefNo: 'NGX77', amount: '1760.00', statusCode: '000' } : ref === 'REF-OPEN' ? { status: 'Initiated' } : { status: 'Aborted', statusCode: '1001' } }));
    const g = createNagadGateway({ ...KEYS, fetch: n.fetch });
    const signed = Object.fromEntries(new URL(signedCallbackUrl(KEYS.merchantPrivateKey, 'nagad', BASE, PID)).searchParams.entries());
    const read = g.readCallback({ params: { ...signed, payment_ref_id: 'REF-PAID', status: 'Success', order_id: 'X', merchant: KEYS.merchantId } });
    expect(read).toEqual({ ok: true, paymentId: PID, providerRef: 'REF-PAID', claim: 'success', eventKey: 'REF-PAID:success' });
    expect(await g.confirm(read as Extract<typeof read, { ok: true }>)).toEqual({ state: 'PAID', providerRef: 'REF-PAID', providerTrxId: 'NGX77', amountMinor: 176_000, currency: 'BDT', failureCode: null });
    const at = (ref: string, claim: 'success' | 'failure' | 'cancel') => ({ ok: true as const, paymentId: PID, providerRef: ref, claim, eventKey: `${ref}:${claim}` });
    // a "failure" redirect for a payment Nagad says succeeded: Nagad wins; a "success" Nagad has not finished stays open
    expect(await g.confirm(at('REF-PAID', 'failure'))).toMatchObject({ state: 'PAID' });
    expect(await g.confirm(at('REF-OPEN', 'success'))).toMatchObject({ state: 'PENDING', providerTrxId: null });
    expect(await g.confirm(at('REF-OPEN', 'cancel'))).toMatchObject({ state: 'CANCELLED', failureCode: 'CUSTOMER_CANCELLED' });
    expect(await g.confirm(at('REF-GONE', 'success'))).toMatchObject({ state: 'CANCELLED', failureCode: '1001' });
    expect(g.readCallback({ params: { ...signed, payment_ref_id: 'REF-X', status: 'Aborted' } })).toMatchObject({ ok: true, claim: 'cancel' });
    // forged, the practice gateway's, or a strange reference: refused before any call
    expect(g.readCallback({ params: { ...signed, pid: PID.replace('168', '167'), payment_ref_id: 'REF-PAID', status: 'Success' } })).toEqual({ ok: false, reason: 'mismatch' });
    expect(g.readCallback({ params: mockCallback('nagad', BASE, PID, 'success') })).toEqual({ ok: false, reason: 'mismatch' });
    expect(g.readCallback({ params: { ...signed, payment_ref_id: '../x', status: 'Success' } })).toEqual({ ok: false, reason: 'malformed' });
    await expect(g.query('../x')).rejects.toMatchObject({ code: 'BAD_ANSWER' });
  });

  it('refusals, outages and broken answers are stable errors; a bad key is NOT_CONFIGURED; one-line PEMs work', async () => {
    const pemOneLine = (merchant.privateKey.export({ format: 'pem', type: 'pkcs8' }) as string).replace(/\n/g, '');
    expect(nagadPem(pemOneLine, 'PRIVATE KEY')).toBe(merchant.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    const ok = createNagadGateway({ ...KEYS, merchantPrivateKey: pemOneLine, fetch: fakeNagad().fetch });
    await expect(ok.initiate(START)).resolves.toMatchObject({ providerRef: expect.stringMatching(/^REF/) });

    const wrongKey = createNagadGateway({ ...KEYS, merchantPrivateKey: bare(pair().privateKey, 'pkcs8'), fetch: fakeNagad().fetch });
    await expect(wrongKey.initiate(START)).rejects.toMatchObject({ code: 'REJECTED' });
    const broken = createNagadGateway({ ...KEYS, nagadPublicKey: 'not-a-key', fetch: fakeNagad().fetch });
    await expect(broken.initiate(START)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    const down = createNagadGateway({ ...KEYS, fetch: async () => new Response('{}', { status: 502 }) });
    await expect(down.query('REF1')).rejects.toMatchObject({ code: 'UNREACHABLE', retryable: true });
    const keys = createNagadGateway({ ...KEYS, fetch: async () => new Response('{}', { status: 403 }) });
    await expect(keys.query('REF1')).rejects.toMatchObject({ code: 'REJECTED', retryable: false });
    const noJson = createNagadGateway({ ...KEYS, fetch: async () => new Response('<html>', { status: 200 }) });
    await expect(noJson.query('REF1')).rejects.toMatchObject({ code: 'BAD_ANSWER' });

    const config = { baseUrl: KEYS.baseUrl, merchantId: KEYS.merchantId, merchantNumber: KEYS.merchantNumber };
    const ctx = (mode: 'MOCK' | 'LIVE', secret: (f: string) => Promise<string | null>) => ({ mode, config, storeId: null, secret });
    await expect(nagadAdapter.create(ctx('LIVE', async () => null))).rejects.toThrow(/not entered yet/);
    const mock = await nagadAdapter.mock(ctx('MOCK', async () => null));
    expect(mock.provider).toBe('nagad');
    expect(await nagadAdapter.test(mock, ctx('MOCK', async () => null))).toEqual({ ok: true, message: expect.stringMatching(/practice/) });
    expect(await nagadAdapter.test(down, ctx('LIVE', async () => 'x'))).toMatchObject({ ok: false });
    expect(nagadAdapter.configSchema.safeParse({ ...config, baseUrl: 'http://nagad.example.test' }).success).toBe(false);
    expect(nagadAdapter.configSchema.safeParse({ ...config, merchantNumber: '123' }).success).toBe(false);
    expect(nagadAdapter.configSchema.safeParse({ ...config, ipV4: '203.0.113.7' }).success).toBe(true);
  });
});
