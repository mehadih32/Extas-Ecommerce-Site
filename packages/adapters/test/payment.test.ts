// PR 167 — the payment gateway contract: the signed callback address (a forged or altered one is refused), the practice
// gateway behind MOCK, and bKash's tokenized checkout against a fake bKash (no network): the token kept and reused,
// the session opened with our signed callback and the amount in taka, a success executed on the server and only
// bKash's answer trusted, a failure or cancel checked with the status query, refusals and outages as stable errors,
// and the Test button. Every key and value is made up.
import { describe, expect, it } from 'vitest';
import { bkashAdapter, bkashAmount, checkCallbackSignature, createBkashGateway, createMockGateway, mockCallback, PaymentGatewayError, signedCallbackUrl, type FetchLike } from '../src';

const PID = '0192a0b0-0000-7000-8000-000000000167';
const BASE = 'https://shop.example.test/api/payments/callback/bkash';

describe('PR 167 · the signed callback address', () => {
  it('signs pid with the key; a changed pid, a wrong key or a missing sig is refused', () => {
    const url = new URL(signedCallbackUrl('key-one', 'bkash', BASE, PID));
    const params = Object.fromEntries(url.searchParams.entries());
    expect(checkCallbackSignature('key-one', 'bkash', params)).toEqual({ ok: true, paymentId: PID });
    expect(checkCallbackSignature('key-two', 'bkash', params)).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkCallbackSignature('key-one', 'nagad', params)).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkCallbackSignature('key-one', 'bkash', { ...params, pid: PID.replace('167', '168') })).toEqual({ ok: false, reason: 'mismatch' });
    expect(checkCallbackSignature('key-one', 'bkash', { pid: PID })).toEqual({ ok: false, reason: 'missing' });
    expect(checkCallbackSignature('key-one', 'bkash', { pid: 'x', sig: 'y' })).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('PR 167 · the practice gateway (MOCK)', () => {
  it('comes straight back claiming success; its callbacks are signed; it answers what was claimed', async () => {
    const g = createMockGateway('bkash');
    const s = await g.initiate({ paymentId: PID, idempotencyKey: 'k:pay:1', orderNumber: 'S-1', amountMinor: 176_000, currency: 'BDT', payerReference: 'S-1', callbackBaseUrl: BASE });
    expect(s.providerRef).toBe(`mock-${PID}`);
    const back = g.readCallback({ params: Object.fromEntries(new URL(s.redirectUrl).searchParams.entries()) });
    expect(back).toEqual({ ok: true, paymentId: PID, providerRef: `mock-${PID}`, claim: 'success', eventKey: `mock-${PID}:success` });
    expect(await g.confirm(back as Extract<typeof back, { ok: true }>)).toMatchObject({ state: 'PAID', providerTrxId: expect.stringMatching(/^mock-/) });
    const fail = g.readCallback({ params: mockCallback('bkash', BASE, PID, 'failure') });
    expect(await g.confirm(fail as Extract<typeof fail, { ok: true }>)).toMatchObject({ state: 'FAILED', failureCode: 'MOCK_FAILURE', providerTrxId: null });
    const cancel = g.readCallback({ params: mockCallback('bkash', BASE, PID, 'cancel') });
    expect(await g.confirm(cancel as Extract<typeof cancel, { ok: true }>)).toMatchObject({ state: 'CANCELLED' });
    expect(await g.query(`mock-${PID}`)).toMatchObject({ state: 'PENDING' });
    // another provider's practice callback is not this one's
    expect(g.readCallback({ params: mockCallback('nagad', BASE, PID, 'success') })).toEqual({ ok: false, reason: 'mismatch' });
    expect(g.readCallback({ params: { ...mockCallback('bkash', BASE, PID, 'success'), status: 'maybe' } })).toEqual({ ok: false, reason: 'malformed' });
  });
});

/** A fake bKash: answers by path, records every call. */
function fakeBkash(answers: Partial<Record<'grant' | 'create' | 'execute' | 'status', (body: Record<string, unknown>) => { status?: number; json: unknown }>>) {
  const calls: { path: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ path, headers: init.headers as Record<string, string>, body });
    const key = path.endsWith('/grant') ? 'grant' : path.endsWith('/create') ? 'create' : path.endsWith('/execute') ? 'execute' : 'status';
    const a = answers[key]?.(body) ?? { status: 404, json: {} };
    return new Response(JSON.stringify(a.json), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetch };
}
const KEYS = { baseUrl: 'https://bkash.example.test/v1.2.0-beta/', appKey: 'app-key-1', appSecret: 'app-secret-1', username: 'user-1', password: 'pass-1' };
const grant = () => ({ json: { id_token: 'token-1', expires_in: 3600, statusCode: '0000' } });

describe('PR 167 · bKash tokenized checkout', () => {
  it('opens a session with the token, our signed callback and the amount in taka; the token is reused', async () => {
    const b = fakeBkash({ grant, create: () => ({ json: { paymentID: 'TR0011abc', bkashURL: 'https://pay.example.test/TR0011abc', statusCode: '0000' } }) });
    const g = createBkashGateway({ ...KEYS, fetch: b.fetch });
    const s = await g.initiate({ paymentId: PID, idempotencyKey: 'order-key:pay:1', orderNumber: 'S-1', amountMinor: 176_050, currency: 'BDT', payerReference: 'S-1', callbackBaseUrl: BASE });
    expect(s).toEqual({ providerRef: 'TR0011abc', redirectUrl: 'https://pay.example.test/TR0011abc', expiresAt: null });
    await g.initiate({ paymentId: PID, idempotencyKey: 'order-key:pay:2', orderNumber: 'S-1', amountMinor: 100, currency: 'BDT', payerReference: 'S-1', callbackBaseUrl: BASE });
    expect(b.calls.map((c) => c.path)).toEqual(['/v1.2.0-beta/tokenized/checkout/token/grant', '/v1.2.0-beta/tokenized/checkout/create', '/v1.2.0-beta/tokenized/checkout/create']);
    expect(b.calls[0]).toMatchObject({ headers: { username: 'user-1', password: 'pass-1' }, body: { app_key: 'app-key-1', app_secret: 'app-secret-1' } });
    const create = b.calls[1]!;
    expect(create.headers).toMatchObject({ authorization: 'token-1', 'x-app-key': 'app-key-1' });
    expect(create.body).toMatchObject({ mode: '0011', intent: 'sale', amount: '1760.50', currency: 'BDT', merchantInvoiceNumber: 'order-key:pay:1', payerReference: 'S-1' });
    const cb = Object.fromEntries(new URL(String(create.body.callbackURL)).searchParams.entries());
    expect(checkCallbackSignature('app-secret-1', 'bkash', cb)).toEqual({ ok: true, paymentId: PID });
    expect(bkashAmount(5)).toBe('0.05');
  });

  it('a success callback is executed on the server; only bKash’s answer counts', async () => {
    const b = fakeBkash({ grant, execute: () => ({ json: { paymentID: 'TR0001', trxID: 'BKX123', transactionStatus: 'Completed', amount: '1760.00', currency: 'BDT', statusCode: '0000' } }) });
    const g = createBkashGateway({ ...KEYS, fetch: b.fetch });
    const params = { ...Object.fromEntries(new URL(signedCallbackUrl('app-secret-1', 'bkash', BASE, PID)).searchParams.entries()), paymentID: 'TR0001', status: 'success' };
    const read = g.readCallback({ params });
    expect(read).toEqual({ ok: true, paymentId: PID, providerRef: 'TR0001', claim: 'success', eventKey: 'TR0001:success' });
    expect(await g.confirm(read as Extract<typeof read, { ok: true }>)).toEqual({ state: 'PAID', providerRef: 'TR0001', providerTrxId: 'BKX123', amountMinor: 176_000, currency: 'BDT', failureCode: null });
    // the practice gateway's or another key's callback is refused before any call
    expect(g.readCallback({ params: mockCallback('bkash', BASE, PID, 'success') })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('an execute that fails falls back to the status; a failure or cancel claim is checked, never taken as paid', async () => {
    const b = fakeBkash({
      grant,
      execute: () => ({ json: { statusCode: '2023', statusMessage: 'Insufficient Balance' } }),
      status: (body) => ({ json: body.paymentID === 'TR-PAID' ? { paymentID: 'TR-PAID', trxID: 'BKX9', transactionStatus: 'Completed', amount: '10.00', currency: 'BDT' } : { paymentID: body.paymentID, transactionStatus: 'Initiated' } }),
    });
    const g = createBkashGateway({ ...KEYS, fetch: b.fetch });
    const at = (ref: string, claim: 'success' | 'failure' | 'cancel') => ({ ok: true as const, paymentId: PID, providerRef: ref, claim, eventKey: `${ref}:${claim}` });
    expect(await g.confirm(at('TR2', 'success'))).toMatchObject({ state: 'FAILED', failureCode: '2023', providerTrxId: null });
    expect(await g.confirm(at('TR3', 'cancel'))).toMatchObject({ state: 'CANCELLED', failureCode: 'CUSTOMER_CANCELLED' });
    expect(await g.confirm(at('TR4', 'failure'))).toMatchObject({ state: 'FAILED', failureCode: 'BKASH_FAILURE' });
    // a "failure" callback for a payment bKash says is completed: bKash's answer wins
    expect(await g.confirm(at('TR-PAID', 'failure'))).toMatchObject({ state: 'PAID', providerTrxId: 'BKX9', amountMinor: 1_000 });
    expect(await g.query('TR5')).toMatchObject({ state: 'PENDING' });
  });

  it('refused keys, an outage and a broken answer are stable errors; the Test button needs the keys', async () => {
    const refused = createBkashGateway({ ...KEYS, fetch: fakeBkash({ grant: () => ({ json: { statusCode: '2079', statusMessage: 'Invalid username and password' } }) }).fetch });
    await expect(refused.query('x')).rejects.toMatchObject({ code: 'REJECTED', retryable: false });
    const down = createBkashGateway({ ...KEYS, fetch: fakeBkash({ grant: () => ({ status: 503, json: {} }) }).fetch });
    await expect(down.query('x')).rejects.toMatchObject({ code: 'UNREACHABLE', retryable: true });
    const offline = createBkashGateway({ ...KEYS, fetch: async () => { throw new TypeError('fetch failed'); } });
    await expect(offline.query('x')).rejects.toBeInstanceOf(PaymentGatewayError);
    const noJson = createBkashGateway({ ...KEYS, fetch: async () => new Response('<html>', { status: 200 }) });
    await expect(noJson.query('x')).rejects.toMatchObject({ code: 'BAD_ANSWER' });

    const ctx = (mode: 'MOCK' | 'LIVE', secret: (f: string) => Promise<string | null>) => ({ mode, config: { baseUrl: KEYS.baseUrl }, storeId: null, secret });
    await expect(bkashAdapter.create(ctx('LIVE', async () => null))).rejects.toThrow(/not entered yet/);
    const mock = await bkashAdapter.mock(ctx('MOCK', async () => null));
    expect(await bkashAdapter.test(mock, ctx('MOCK', async () => null))).toEqual({ ok: true, message: expect.stringMatching(/practice/) });
    expect(await bkashAdapter.test(refused, ctx('LIVE', async () => 'x'))).toMatchObject({ ok: false });
    expect(bkashAdapter.configSchema.safeParse({ baseUrl: 'http://bkash.example.test' }).success).toBe(false);
  });
});
