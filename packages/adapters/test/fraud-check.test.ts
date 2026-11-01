// PR 567 — the courier fraud checks behind one contract: the counts read from each source's own answer shapes, the number
// written the couriers' way, the practice source ("nothing known" unless a test hands it samples), the HTTP clients against
// stand-in servers (never the real ones, no real keys: Steadfast's GET with its two keys, Pathao's token + POST with one
// fresh token after a 401, an aggregator's ?phone=), a bad or missing answer is no answer, and each adapter needs its keys.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectionCatalogue,
  createHttpFraudCheck,
  createMockFraudCheck,
  FRAUD_PROBE_NUMBER,
  FraudCheckError,
  fraudAggregatorAdapter,
  fraudCheckAdapters,
  localNumberBD,
  NOTHING_KNOWN,
  PATHAO_LIVE_BASE_URL,
  pathaoFraudAdapter,
  readCounts,
  STEADFAST_DEFAULT_BASE_URL,
  steadfastFraudAdapter,
  type AdapterContext,
} from '../src';

const PHONE = '+8801711000567'; // hardcode-ok: a made-up test number
const LOCAL = '01711000567'; // hardcode-ok: the same made-up test number, written the couriers' way

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Answer = { status?: number; body?: unknown; text?: string } | Error;

/** A stand-in server: answers by the url's ending (a list is used in turn), records every request. */
function stand(answers: Record<string, Answer | Answer[]>) {
  const seen: Seen[] = [];
  const used = new Map<string, number>();
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ method: init?.method ?? 'GET', url, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (init?.signal?.aborted) throw new Error('aborted');
    const key = Object.keys(answers).find((k) => url.split('?')[0]!.endsWith(k));
    let a: Answer = { status: 404, body: { message: 'Not found' } };
    if (key) {
      const list = answers[key]!;
      if (Array.isArray(list)) {
        const n = used.get(key) ?? 0;
        used.set(key, n + 1);
        a = list[Math.min(n, list.length - 1)]!;
      } else a = list;
    }
    if (a instanceof Error) throw a;
    return new Response(a.text ?? JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchFn };
}

function ctx<C>(config: C, secrets: Record<string, string>): AdapterContext<C> {
  return { mode: 'LIVE', config, storeId: null, secret: async (f) => secrets[f] ?? null };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readCounts — two whole counts from any source shape', () => {
  it('reads the body itself, its data, its summary and the aggregator shapes', () => {
    expect(readCounts({ total_delivered: 12, total_cancelled: 3 })).toEqual({ delivered: 12, cancelled: 3 });
    expect(readCounts({ data: { delivered: '7', cancelled: '1' } })).toEqual({ delivered: 7, cancelled: 1 });
    expect(readCounts({ summary: { success_parcel: 4, cancelled_parcel: 6 } })).toEqual({ delivered: 4, cancelled: 6 });
    expect(readCounts({ data: { summary: { successful_delivery: 2, returned: 9 } } })).toEqual({ delivered: 2, cancelled: 9 });
    expect(readCounts({ courierData: { summary: { success: 5, cancel: 0 } } })).toEqual({ delivered: 5, cancelled: 0 });
  });
  it("takes Pathao's total and successful ones: the cancelled are the rest", () => {
    expect(readCounts({ data: { customer: { total_delivery: 10, successful_delivery: 6 } } })).toEqual({ delivered: 6, cancelled: 4 });
  });
  it('a total smaller than the delivered, a missing count, a negative, a fraction or text is no answer', () => {
    expect(readCounts({ data: { customer: { total_delivery: 3, successful_delivery: 6 } } })).toBeNull();
    expect(readCounts({ delivered: 4 })).toBeNull();
    expect(readCounts({ delivered: -1, cancelled: 2 })).toBeNull();
    expect(readCounts({ delivered: 1.5, cancelled: 2 })).toBeNull();
    expect(readCounts({ delivered: 'many', cancelled: 2 })).toBeNull();
    expect(readCounts(null)).toBeNull();
    expect(readCounts('ok')).toBeNull();
    expect(readCounts([1, 2])).toBeNull();
  });
});

describe('localNumberBD', () => {
  it('writes a Bangladeshi mobile the couriers’ way and refuses anything else', () => {
    expect(localNumberBD(PHONE)).toBe(LOCAL);
    expect(localNumberBD(FRAUD_PROBE_NUMBER)).toMatch(/^01[3-9]\d{8}$/);
    for (const bad of ['01711000567', '+8801211000567', '+44201234567', '+88017110005670', '']) expect(() => localNumberBD(bad)).toThrow(FraudCheckError);
  });
});

describe('the practice source', () => {
  it('knows nothing about every number unless a test hands it samples', async () => {
    const m = createMockFraudCheck('steadfast', { [LOCAL]: { delivered: 10, cancelled: 1 } });
    expect(m.source).toBe('steadfast');
    expect(await m.check(PHONE)).toEqual({ delivered: 10, cancelled: 1 });
    expect(await createMockFraudCheck('pathao').check(PHONE)).toEqual(NOTHING_KNOWN);
    expect((await m.health()).ok).toBe(true);
  });
  it('stops when asked and refuses a number that is not a Bangladeshi mobile', async () => {
    const m = createMockFraudCheck('steadfast');
    const ac = new AbortController();
    ac.abort();
    await expect(m.check(PHONE, ac.signal)).rejects.toThrow(FraudCheckError);
    await expect(m.check('+44201234567')).rejects.toThrow(FraudCheckError);
  });
});

describe('the HTTP client', () => {
  it('a refusal, an answer that is not JSON, no counts or no answer at all is an error, never a verdict', async () => {
    const make = (a: Answer) => createHttpFraudCheck({ source: 's', url: (l) => `https://x.test/c/${l}`, headers: async () => ({}), probe: FRAUD_PROBE_NUMBER, fetch: stand({ [`/c/${LOCAL}`]: a }).fetchFn });
    await expect(make({ status: 500, body: {} }).check(PHONE)).rejects.toThrow('s refused (500)');
    await expect(make({ text: '<html>' }).check(PHONE)).rejects.toThrow('not JSON');
    await expect(make({ body: { status: 200 } }).check(PHONE)).rejects.toThrow('no delivered and cancelled counts');
    await expect(make(new Error('ECONNRESET')).check(PHONE)).rejects.toThrow('s did not answer: ECONNRESET');
  });
  it('gives up when the signal aborts', async () => {
    const s = stand({ [`/c/${LOCAL}`]: { body: { delivered: 1, cancelled: 0 } } });
    const api = createHttpFraudCheck({ source: 's', url: (l) => `https://x.test/c/${l}`, headers: async () => ({}), probe: FRAUD_PROBE_NUMBER, fetch: s.fetchFn });
    const ac = new AbortController();
    ac.abort();
    await expect(api.check(PHONE, ac.signal)).rejects.toThrow(FraudCheckError);
  });
  it('a 401 without a way to refresh is not retried', async () => {
    const s = stand({ [`/c/${LOCAL}`]: { status: 401, body: {} } });
    const api = createHttpFraudCheck({ source: 's', url: (l) => `https://x.test/c/${l}`, headers: async () => ({}), probe: FRAUD_PROBE_NUMBER, fetch: s.fetchFn });
    await expect(api.check(PHONE)).rejects.toThrow('s refused (401)');
    expect(s.seen).toHaveLength(1);
  });
});

describe("Steadfast's own check", () => {
  it('GETs /fraud_check/<number> with its two keys and reads the counts', async () => {
    const s = stand({ [`/fraud_check/${LOCAL}`]: { body: { total_delivered: 10, total_cancelled: 1 } } });
    vi.stubGlobal('fetch', s.fetchFn);
    const api = await steadfastFraudAdapter.create(ctx({}, { apiKey: 'test-api-key', secretKey: 'test-secret-key' }));
    expect(api.source).toBe('steadfast');
    expect(await api.check(PHONE)).toEqual({ delivered: 10, cancelled: 1 });
    expect(s.seen[0]).toMatchObject({ method: 'GET', url: `${STEADFAST_DEFAULT_BASE_URL}/fraud_check/${LOCAL}`, headers: { 'Api-Key': 'test-api-key', 'Secret-Key': 'test-secret-key' } });
  });
  it('a test server and another path can be set; the Test asks the probe number', async () => {
    const probe = localNumberBD(FRAUD_PROBE_NUMBER);
    const s = stand({ [`/v2/check/${probe}`]: { body: { data: { delivered: 0, cancelled: 0 } } } });
    vi.stubGlobal('fetch', s.fetchFn);
    const cfg = steadfastFraudAdapter.configSchema.parse({ baseUrl: 'https://sf.example.test/api/', path: '/v2/check/{phone}' });
    const api = await steadfastFraudAdapter.create(ctx(cfg, { apiKey: 'k', secretKey: 's' }));
    const t = await steadfastFraudAdapter.test(api, ctx(cfg, {}));
    expect(t.ok).toBe(true);
    expect(s.seen[0]!.url).toBe(`https://sf.example.test/api/v2/check/${probe}`);
  });
  it('needs both keys, an https address and a path starting with /', async () => {
    await expect(steadfastFraudAdapter.create(ctx({}, { apiKey: 'k' }))).rejects.toThrow('secretKey');
    expect(steadfastFraudAdapter.configSchema.safeParse({ baseUrl: 'http://sf.example.test' }).success).toBe(false);
    expect(steadfastFraudAdapter.configSchema.safeParse({ path: 'fraud?x=1' }).success).toBe(false);
  });
});

describe("Pathao's own check", () => {
  const KEYS = { clientId: 'cid', clientSecret: 'csec', username: 'merchant@example.test', password: 'pw' };
  it('gets a token from the four keys, POSTs the number and reads total minus successful', async () => {
    const s = stand({
      '/aladdin/api/v1/issue-token': { body: { access_token: 'tok-1' } },
      '/aladdin/api/v1/user/success': { body: { data: { customer: { total_delivery: 9, successful_delivery: 2 } } } },
    });
    vi.stubGlobal('fetch', s.fetchFn);
    const api = await pathaoFraudAdapter.create(ctx({}, KEYS));
    expect(await api.check(PHONE)).toEqual({ delivered: 2, cancelled: 7 });
    expect(s.seen[0]).toMatchObject({ method: 'POST', url: `${PATHAO_LIVE_BASE_URL}/aladdin/api/v1/issue-token`, body: { client_id: 'cid', client_secret: 'csec', grant_type: 'password', username: KEYS.username, password: 'pw' } });
    expect(s.seen[1]).toMatchObject({ method: 'POST', url: `${PATHAO_LIVE_BASE_URL}/aladdin/api/v1/user/success`, body: { phone: LOCAL }, headers: { Authorization: 'Bearer tok-1' } });
    // the token is kept for the next number
    await api.check(PHONE);
    expect(s.seen.filter((x) => x.url.endsWith('issue-token'))).toHaveLength(1);
  });
  it('a token that ran out (401) gets one fresh token and one more try', async () => {
    const s = stand({
      '/aladdin/api/v1/issue-token': [{ body: { access_token: 'old' } }, { body: { access_token: 'new' } }],
      '/aladdin/api/v1/user/success': [{ status: 401, body: {} }, { body: { data: { customer: { total_delivery: 1, successful_delivery: 1 } } } }],
    });
    vi.stubGlobal('fetch', s.fetchFn);
    const api = await pathaoFraudAdapter.create(ctx({}, KEYS));
    expect(await api.check(PHONE)).toEqual({ delivered: 1, cancelled: 0 });
    expect(s.seen.map((x) => (x.headers as Record<string, string>).Authorization ?? 'token')).toEqual(['token', 'Bearer old', 'token', 'Bearer new']);
  });
  it('no token is an error; all four keys are needed', async () => {
    vi.stubGlobal('fetch', stand({ '/aladdin/api/v1/issue-token': { status: 400, body: { message: 'bad' } } }).fetchFn);
    const api = await pathaoFraudAdapter.create(ctx({}, KEYS));
    await expect(api.check(PHONE)).rejects.toThrow('Pathao gave no token (400)');
    await expect(pathaoFraudAdapter.create(ctx({}, { ...KEYS, password: '' }))).rejects.toThrow('password');
  });
});

describe('an aggregator', () => {
  it('GETs its address with ?phone= and its key as a bearer token', async () => {
    const s = stand({ '/v1/check': { body: { courierData: { summary: { total_delivered: 2, total_cancelled: 8 } } } } });
    vi.stubGlobal('fetch', s.fetchFn);
    const cfg = fraudAggregatorAdapter.configSchema.parse({ baseUrl: 'https://agg.example.test/v1/check' });
    const api = await fraudAggregatorAdapter.create(ctx(cfg, { apiKey: 'agg-key' }));
    expect(api.source).toBe('aggregator');
    expect(await api.check(PHONE)).toEqual({ delivered: 2, cancelled: 8 });
    expect(s.seen[0]).toMatchObject({ method: 'GET', url: `https://agg.example.test/v1/check?phone=${LOCAL}`, headers: { Authorization: 'Bearer agg-key' } });
  });
  it('an address that already carries a query gets &phone=; the address is required and https', async () => {
    const s = stand({ '/check': { body: { delivered: 0, cancelled: 0 } } });
    vi.stubGlobal('fetch', s.fetchFn);
    const cfg = fraudAggregatorAdapter.configSchema.parse({ baseUrl: 'https://agg.example.test/check?v=2' });
    await (await fraudAggregatorAdapter.create(ctx(cfg, { apiKey: 'k' }))).check(PHONE);
    expect(s.seen[0]!.url).toBe(`https://agg.example.test/check?v=2&phone=${LOCAL}`);
    expect(fraudAggregatorAdapter.configSchema.safeParse({}).success).toBe(false);
    expect(fraudAggregatorAdapter.configSchema.safeParse({ baseUrl: 'http://agg.example.test' }).success).toBe(false);
  });
});

describe('the three adapters and their rows', () => {
  it('are FRAUD_CHECK adapters with their own providers and keys, never the courier connection’s', async () => {
    expect(fraudCheckAdapters.map((a) => [a.kind, a.provider])).toEqual([
      ['FRAUD_CHECK', 'steadfastFraud'],
      ['FRAUD_CHECK', 'pathaoFraud'],
      ['FRAUD_CHECK', 'fraudAggregator'],
    ]);
    for (const a of fraudCheckAdapters) {
      const row = connectionCatalogue.find((c) => c.id === a.provider);
      expect(row).toMatchObject({ kind: 'FRAUD_CHECK', provider: a.provider, adapter: true, exclusive: false, targetMode: 'LIVE' });
      expect(row!.secrets.map((s) => s.field)).toEqual([...a.secrets]);
      // the practice source answers "nothing known"
      expect(await (await a.mock(ctx({} as never, {}))).check(PHONE)).toEqual(NOTHING_KNOWN);
    }
    expect(connectionCatalogue.find((c) => c.provider === 'steadfast')!.kind).toBe('COURIER');
  });
});
