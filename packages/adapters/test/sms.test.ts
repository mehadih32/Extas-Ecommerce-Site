// PR 130 — the mock SMS sender: nothing leaves the server, the outbox keeps the newest messages, a bad number is refused.
import { describe, expect, it } from 'vitest';
import { allAdapters, bulkSmsBdAdapter, createBulkSmsBdClient, mockSmsAdapter, mockSmsOutbox, needsUnicode, smsAdapters } from '../src';

const ctx = { mode: 'MOCK' as const, config: {}, storeId: 1, secret: async () => null };

describe('mock SMS (PR 130)', () => {
  it('sends into the outbox and the newest message to a number is found', async () => {
    mockSmsOutbox.clear();
    const s = await mockSmsAdapter.mock(ctx);
    expect(await s.send({ to: '+8801700000130', text: 'one', purpose: 'account.code' })).toMatchObject({ ok: true });
    expect(await s.send({ to: '+8801700000130', text: 'two', purpose: 'account.code' })).toMatchObject({ ok: true });
    expect(mockSmsOutbox.lastTo('+8801700000130')?.text).toBe('two');
    expect(mockSmsOutbox.all()).toHaveLength(2);
  });

  it('refuses a number that is not in +country form', async () => {
    const s = await mockSmsAdapter.mock(ctx);
    expect(await s.send({ to: '01700000130', text: 'x', purpose: 'account.code' })).toEqual({ ok: false, error: expect.any(String) });
  });

  it('keeps only the newest messages', async () => {
    mockSmsOutbox.clear();
    const s = await mockSmsAdapter.mock(ctx);
    for (let i = 0; i < 205; i++) await s.send({ to: '+8801700000130', text: String(i), purpose: 'p' });
    expect(mockSmsOutbox.all()).toHaveLength(200);
    expect(mockSmsOutbox.all()[0]?.text).toBe('5');
  });

  it('has no live mode, no key, and stays out of Keys & connections; the gateway (PR 291) is listed instead', async () => {
    expect(mockSmsAdapter.modes).toEqual([]);
    expect(mockSmsAdapter.secrets).toEqual([]);
    expect(smsAdapters[0]).toBe(mockSmsAdapter);
    expect(allAdapters.filter((a) => a.kind === 'SMS')).toEqual([bulkSmsBdAdapter]);
    await expect(mockSmsAdapter.create(ctx)).rejects.toThrow();
  });
});

/** A stand-in gateway: answers by path, records every request (nothing leaves the machine). */
function gateway(answers: Record<string, { status?: number; body?: unknown } | Error>) {
  const seen: { method: string; url: string; body: URLSearchParams | null }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ method: init?.method ?? 'GET', url, body: init?.body ? new URLSearchParams(String(init.body)) : null });
    const key = Object.keys(answers).find((k) => new URL(url).pathname.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: {} };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchFn };
}

const BASE = 'https://gateway.example/api';
const TO = '+8801700000291'; // hardcode-ok: a made-up test number

describe('PR 291 · the BulkSMSBD gateway', () => {
  it('sends a form with the key, the number in 880 form, the masking name or its own sender id, and the type', async () => {
    const g = gateway({ '/smsapi': { body: { response_code: 202, message_id: 9911, success_message: 'SMS Submitted Successfully' } } });
    const api = createBulkSmsBdClient({ baseUrl: `${BASE}/`, apiKey: 'test-key-291', senderId: '8809600000000', fetch: g.fetchFn });
    expect(await api.send({ to: TO, text: 'Order 1001 received', purpose: 'order.placed' })).toEqual({ ok: true, messageId: '9911' });
    expect(await api.send({ to: TO, text: 'অর্ডার পেয়েছি', purpose: 'order.placed', senderId: 'SHOPNAME' })).toMatchObject({ ok: true });
    expect(g.seen).toHaveLength(2);
    expect(g.seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/smsapi` });
    expect(Object.fromEntries(g.seen[0]!.body!)).toEqual({ api_key: 'test-key-291', type: 'text', number: '8801700000291', senderid: '8809600000000', message: 'Order 1001 received' });
    expect(Object.fromEntries(g.seen[1]!.body!)).toMatchObject({ type: 'unicode', senderid: 'SHOPNAME' });
  });

  it('an invalid number is unreachable (never tried again); other codes, HTTP errors and a dead line are plain failures', async () => {
    const send = async (answer: { status?: number; body?: unknown } | Error) =>
      createBulkSmsBdClient({ baseUrl: BASE, apiKey: 'k', senderId: 's', fetch: gateway({ '/smsapi': answer }).fetchFn }).send({ to: TO, text: 'x', purpose: 'p' });
    expect(await send({ body: { response_code: 1001, error_message: 'Invalid Number' } })).toEqual({ ok: false, error: '1001: the number is not valid', unreachable: true });
    expect(await send({ body: { response_code: 1007 } })).toEqual({ ok: false, error: '1007: the balance is used up' });
    expect(await send({ body: { response_code: 1099, error_message: 'Something new' } })).toEqual({ ok: false, error: '1099: Something new' });
    expect(await send({ status: 502, body: {} })).toEqual({ ok: false, error: "HTTP 502: the gateway's answer was not understood" });
    expect(await send(new Error('socket hang up'))).toEqual({ ok: false, error: 'the gateway did not answer (socket hang up)' });
    const api = createBulkSmsBdClient({ baseUrl: BASE, apiKey: 'k', senderId: 's', fetch: gateway({}).fetchFn });
    expect(await api.send({ to: '01700000291', text: 'x', purpose: 'p' })).toMatchObject({ ok: false, unreachable: true }); // hardcode-ok: a made-up test number
  });

  it('the balance (the Test button) in minor units; a refusal names its code', async () => {
    const g = gateway({ '/getBalanceApi': { body: { response_code: 202, balance: '1234.50' } } });
    const api = createBulkSmsBdClient({ baseUrl: BASE, apiKey: 'k', senderId: 's', fetch: g.fetchFn });
    expect(await api.balance()).toEqual({ amountMinor: 123450, sms: null });
    expect(g.seen[0]!.method).toBe('GET');
    const bad = createBulkSmsBdClient({ baseUrl: BASE, apiKey: 'k', senderId: 's', fetch: gateway({ '/getBalanceApi': { body: { response_code: 1011 } } }).fetchFn });
    await expect(bad.balance()).rejects.toThrow('1011: the account was not found');
    const ctxLive = { mode: 'LIVE' as const, config: { senderId: 's' }, storeId: 1, secret: async () => null };
    expect(await bulkSmsBdAdapter.test(api, ctxLive)).toEqual({ ok: true, message: 'connected; balance 1234.50' });
  });

  it('needs its key for LIVE and runs on the mock outbox in MOCK; plain GSM text is "text", Bengali is "unicode"', async () => {
    await expect(bulkSmsBdAdapter.create({ mode: 'LIVE', config: { senderId: 's' }, storeId: 1, secret: async () => null })).rejects.toThrow('apiKey');
    mockSmsOutbox.clear();
    const m = await bulkSmsBdAdapter.mock({ mode: 'MOCK', config: { senderId: 's' }, storeId: 1, secret: async () => null });
    expect(await m.send({ to: TO, text: 'x', purpose: 'p' })).toMatchObject({ ok: true });
    expect(mockSmsOutbox.lastTo(TO)?.text).toBe('x');
    expect(needsUnicode('Pay 1,200 [now] {ok} €')).toBe(false);
    expect(needsUnicode('আপনার অর্ডার')).toBe(true);
    expect(needsUnicode('Hi 🙂')).toBe(true);
  });
});
