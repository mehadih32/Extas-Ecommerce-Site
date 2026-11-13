// PR 671 — the courier's own payment request behind the contract: Steadfast asks and reads back (stand-in server), Pathao
// only reads, RedX has none, and the practice couriers play the whole life (requested, processing, paid or rejected) with
// no stored state, so the web app that asks and the worker that polls read the same thing. No real money, no real keys.
import { describe, expect, it } from 'vitest';
import {
  courierCapabilitiesOf,
  createMockCourier,
  createSteadfastClient,
  mockCourierWorld,
  PRACTICE_PAYOUT_FINAL_MS,
  PRACTICE_PAYOUT_PROCESSING_MS,
  practiceCapabilities,
  practiceVocabulary,
  steadfastAdapter,
  steadfastPayoutState,
} from '../src';

const BASE = 'https://sf.example.test/api/v1';
function stand(answers: Record<string, { status?: number; body?: unknown } | Error>) {
  const seen: { method: string; url: string; body: unknown }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: { message: 'Not found' } };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  }) as typeof fetch;
  return { seen, fetchFn };
}

describe('courier payouts (PR 671)', () => {
  it('capabilities: Steadfast and the practice courier ask, Pathao reads, RedX has none', () => {
    expect(courierCapabilitiesOf('steadfast')!.payouts).toBe('request');
    expect(courierCapabilitiesOf('mockCourier')!.payouts).toBe('request');
    expect(courierCapabilitiesOf('pathao')!.payouts).toBe('read');
    expect(courierCapabilitiesOf('redx')!.payouts).toBe('none');
  });

  it('Steadfast: asks for the amount in taka, reads the state back, maps its words, never invents a state', async () => {
    const s = stand({
      '/payment_request': { body: { payment: { id: 77, amount: 4200, status: 'pending' } } },
      '/payments/77': { body: { payment: { id: 77, amount: 4200, status: 'completed', payment_method: 'bKash', reference: 'TRX1', paid_at: '2026-11-12T10:00:00Z', consignment_ids: [1, 2] } } },
      '/payments': {
        body: {
          payments: [
            { id: 77, amount: 4200, status: 'completed' },
            { id: 70, amount: 100, status: 'weird' },
          ],
        },
      },
      '/get_balance': { body: { status: 200, current_balance: 12345.5 } },
    });
    const api = createSteadfastClient({ baseUrl: BASE, apiKey: 'k', secretKey: 's', fetch: s.fetchFn });
    const r = await api.payouts!.request!({ merchantRef: 'x', amountMinor: 420_000, note: null });
    expect(r).toMatchObject({ ok: true, payout: { ref: '77', state: 'REQUESTED', amountMinor: 420_000 } });
    expect(s.seen[0]).toMatchObject({ method: 'POST', body: { amount: 4200 } });
    const st = await api.payouts!.status('77');
    expect(st).toMatchObject({ ref: '77', state: 'PAID', paymentRef: 'TRX1', method: 'bKash', consignmentIds: ['1', '2'] });
    expect(st!.paidAt!.toISOString()).toBe('2026-11-12T10:00:00.000Z');
    // a list row whose word is not known is left out (it is never guessed)
    expect((await api.payouts!.list()).map((p) => p.ref)).toEqual(['77']);
    expect(await api.balance!()).toEqual({ balanceMinor: 1_234_550 });
    expect(await createSteadfastClient({ baseUrl: BASE, apiKey: 'k', secretKey: 's', fetch: stand({}).fetchFn }).payouts!.status('9')).toBeNull();
  });

  it('Steadfast: a refusal is an error with the reason, a lost answer is "may have asked"', async () => {
    const refused = createSteadfastClient({ baseUrl: BASE, apiKey: 'k', secretKey: 's', fetch: stand({ '/payment_request': { status: 422, body: { message: 'Balance too low' } } }).fetchFn });
    expect(await refused.payouts!.request!({ merchantRef: 'x', amountMinor: 100, note: null })).toMatchObject({ ok: false, unknown: false, error: expect.stringMatching(/Balance too low/) });
    const lost = createSteadfastClient({ baseUrl: BASE, apiKey: 'k', secretKey: 's', fetch: stand({ '/payment_request': new Error('socket hang up') }).fetchFn });
    expect(await lost.payouts!.request!({ merchantRef: 'x', amountMinor: 100, note: null })).toMatchObject({ ok: false, unknown: true });
    expect(steadfastPayoutState('Under Review')).toBe('PROCESSING');
    expect(steadfastPayoutState('declined')).toBe('REJECTED');
    expect(steadfastPayoutState('???')).toBeNull();
  });

  it('Pathao only reads: no request, and its live read says plainly that the payments come on the statement', async () => {
    const { pathaoAdapter } = await import('../src');
    const api = await pathaoAdapter.mock!({} as never);
    expect(api.payouts!.request).toBeUndefined();
    expect(await api.payouts!.list()).toEqual([]);
  });

  it('practice payout: requested, processing, then paid (or rejected as planned); the same ref reads the same in any process', async () => {
    const world = mockCourierWorld('mockCourier');
    world.reset();
    let t = 1_800_000_000_000;
    world.useClock(() => t);
    const api = createMockCourier('mockCourier', practiceVocabulary, practiceCapabilities);
    expect(await api.balance!()).toBeNull();
    world.setBalance(500_000);
    expect(await api.balance!()).toEqual({ balanceMinor: 500_000 });

    const a = await api.payouts!.request!({ merchantRef: 'r1', amountMinor: 250_000, note: null });
    if (!a.ok) throw new Error('refused');
    expect(a.payout).toMatchObject({ state: 'REQUESTED', amountMinor: 250_000, paymentRef: null });
    t += PRACTICE_PAYOUT_PROCESSING_MS;
    expect((await api.payouts!.status(a.payout.ref))!.state).toBe('PROCESSING');
    t += PRACTICE_PAYOUT_FINAL_MS;
    const paid = (await api.payouts!.status(a.payout.ref))!;
    expect(paid).toMatchObject({ state: 'PAID', method: 'practice' });
    expect(paid.paymentRef).toMatch(/^MOCK-PAY-/);

    world.planPayout('rejected');
    const b = await api.payouts!.request!({ merchantRef: 'r2', amountMinor: 100, note: null });
    if (!b.ok) throw new Error('refused');
    t += PRACTICE_PAYOUT_FINAL_MS;
    expect(await api.payouts!.status(b.payout.ref)).toMatchObject({ state: 'REJECTED', paymentRef: null });

    // a practice courier asks for an amount, can refuse, can lose the answer; an unknown ref is unknown
    expect(await api.payouts!.request!({ merchantRef: 'r3', amountMinor: null, note: null })).toMatchObject({ ok: false, unknown: false });
    world.failNextPayout('error');
    expect(await api.payouts!.request!({ merchantRef: 'r4', amountMinor: 100, note: null })).toMatchObject({ ok: false, unknown: false });
    world.failNextPayout('timeout');
    expect(await api.payouts!.request!({ merchantRef: 'r5', amountMinor: 100, note: null })).toMatchObject({ ok: false, unknown: true });
    expect(await api.payouts!.status('nonsense')).toBeNull();
    world.reset();
  });

  it("Steadfast keeps its practice world beside the live client: the adapter's practice courier also plays the request", async () => {
    const api = await steadfastAdapter.mock!({} as never);
    const r = await api.payouts!.request!({ merchantRef: 'x', amountMinor: 1000, note: null });
    expect(r.ok && r.payout.ref).toMatch(/^MP-SF-/);
    mockCourierWorld('steadfast').reset();
  });
});
