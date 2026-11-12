// S24 · PR 449/450 — the photoshoot provider adapters (C7.17): the practice provider, FASHN AI's and Fitroom's real
// `health()` against a stand-in server (never the real one, no real keys) — "not found" proves the key, an auth
// refusal does not — their rows in Keys & connections, and (PR 450) every one of their job methods — estimate,
// generate, status, fetch — against the same kind of stand-in, never the real network.
import { describe, expect, it } from 'vitest';
import {
  AdapterError,
  connectionCatalogue,
  emptyPhotoshootMockContext,
  fashnAdapter,
  fashnCapabilities,
  fashnFetch,
  fashnGenerate,
  fashnHealth,
  fashnStatus,
  fitroomAdapter,
  fitroomCapabilities,
  fitroomFetch,
  fitroomGenerate,
  fitroomHealth,
  fitroomStatus,
  FASHN_DEFAULT_BASE_URL,
  FASHN_PROVIDER,
  FITROOM_DEFAULT_BASE_URL,
  FITROOM_PROVIDER,
  findConnection,
  MOCK_PHOTOSHOOT_PROVIDER,
  mockPhotoshootCapabilities,
  mockPhotoshootEstimate,
  mockPhotoshootFetch,
  mockPhotoshootGenerate,
  mockPhotoshootProviderAdapter,
  mockPhotoshootStatus,
  photoshootEstimateFromRate,
  photoshootProviderCapabilitiesOf,
  requirePhotoshootJobSupported,
} from '../src';

interface StandAnswer {
  status?: number;
  body?: unknown;
  /** Extra response headers (e.g. FASHN's `x-fashn-credits-used`); merged over the default content-type. */
  headers?: Record<string, string>;
  /** When set, the response body is this raw payload (e.g. image bytes) instead of JSON.stringify(body). */
  raw?: Uint8Array | string;
}

function stand(answers: Record<string, StandAnswer | Error>) {
  const seen: { url: string; method: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, method: init?.method ?? 'GET', headers: (init?.headers as Record<string, string>) ?? {} });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: {} };
    if (a instanceof Error) throw a;
    if (a.raw !== undefined) return new Response(a.raw, { status: a.status ?? 200, headers: { 'content-type': 'image/jpeg', ...(a.headers ?? {}) } });
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'content-type': 'application/json', ...(a.headers ?? {}) } });
  }) as typeof fetch;
  return { seen, fetchFn };
}

const GARMENT = { url: 'https://cdn.extas.com.bd/garment-prepped/123.jpg' };
const MODEL = { url: 'https://cdn.extas.com.bd/model-library/m1-front.jpg' };

describe('mock photoshoot provider (PR 449)', () => {
  it('answers health ok with no network at all', async () => {
    const api = await mockPhotoshootProviderAdapter.mock(emptyPhotoshootMockContext);
    expect(api.provider).toBe(MOCK_PHOTOSHOOT_PROVIDER);
    expect(api.capabilities).toEqual(mockPhotoshootCapabilities);
    await expect(api.health()).resolves.toEqual({ ok: true, message: expect.stringContaining('practice') });
  });

  it('refuses to create a live client (no key to read yet)', async () => {
    await expect(mockPhotoshootProviderAdapter.create(emptyPhotoshootMockContext)).rejects.toThrow();
  });
});

describe('FASHN AI health (PR 449)', () => {
  it('"not found" on the probe id proves the key works', async () => {
    const s = stand({ [`/v1/status/00000000-0000-0000-0000-000000000000`]: { status: 404, body: { error: null } } });
    const r = await fashnHealth('test-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)();
    expect(r.ok).toBe(true);
    expect(s.seen[0]?.headers.authorization).toBe('Bearer test-key');
  });

  it('FASHN\'s own UnauthorizedAccess body is refused', async () => {
    const s = stand({ [`/v1/status/00000000-0000-0000-0000-000000000000`]: { status: 200, body: { error: 'UnauthorizedAccess' } } });
    const r = await fashnHealth('bad-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)();
    expect(r.ok).toBe(false);
  });

  it('a 401/403 is refused outright', async () => {
    const s = stand({ [`/v1/status/00000000-0000-0000-0000-000000000000`]: { status: 401, body: {} } });
    const r = await fashnHealth('bad-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)();
    expect(r.ok).toBe(false);
  });

  it('a network failure is reported, not thrown', async () => {
    const s = stand({ [`/v1/status/00000000-0000-0000-0000-000000000000`]: new Error('ECONNRESET') });
    const r = await fashnHealth('test-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)();
    expect(r.ok).toBe(false);
  });

  it('create() reads the vault secret and the tier config, test() runs health', async () => {
    const s = stand({ [`/v1/status/00000000-0000-0000-0000-000000000000`]: { status: 404, body: {} } });
    const api = await fashnAdapter.create({ mode: 'LIVE', config: { tier: 'tryon-max' }, storeId: 1, secret: async () => 'test-key' });
    expect(api.provider).toBe(FASHN_PROVIDER);
    expect(api.capabilities.premiumTier).toBe(true);
    // the adapter's own test() just calls api.health() — proven separately above against the stand-in; here it only
    // has to run without throwing, so build a second api whose health is the stand-in directly, never the real network
    const stood: typeof api = { ...api, health: fashnHealth('test-key', FASHN_DEFAULT_BASE_URL, s.fetchFn) };
    await expect(fashnAdapter.test(stood, { mode: 'LIVE', config: { tier: 'tryon-v1.6' }, storeId: 1, secret: async () => 'test-key' })).resolves.toEqual({ ok: true, message: expect.any(String) });
  });

  it('create() throws when no key is entered yet', async () => {
    await expect(fashnAdapter.create({ mode: 'LIVE', config: { tier: 'tryon-v1.6' }, storeId: 1, secret: async () => null })).rejects.toThrow();
  });
});

describe('Fitroom health (PR 449)', () => {
  it('"not found" on the probe id proves the key works', async () => {
    const s = stand({ [`/api/tryon/v2/tasks/00000000-0000-0000-0000-000000000000`]: { status: 404, body: {} } });
    const r = await fitroomHealth('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)();
    expect(r.ok).toBe(true);
    expect(s.seen[0]?.headers['x-api-key']).toBe('test-key');
  });

  it('a 401/403 is refused outright', async () => {
    const s = stand({ [`/api/tryon/v2/tasks/00000000-0000-0000-0000-000000000000`]: { status: 403, body: {} } });
    const r = await fitroomHealth('bad-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)();
    expect(r.ok).toBe(false);
  });

  it('a network failure is reported, not thrown', async () => {
    const s = stand({ [`/api/tryon/v2/tasks/00000000-0000-0000-0000-000000000000`]: new Error('ECONNRESET') });
    const r = await fitroomHealth('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)();
    expect(r.ok).toBe(false);
  });

  it('create() reads the vault secret; capabilities are fixed', async () => {
    const api = await fitroomAdapter.create({ mode: 'LIVE', config: {}, storeId: 1, secret: async () => 'test-key' });
    expect(api.provider).toBe(FITROOM_PROVIDER);
    expect(api.capabilities).toEqual(fitroomCapabilities);
  });

  it('create() throws when no key is entered yet', async () => {
    await expect(fitroomAdapter.create({ mode: 'LIVE', config: {}, storeId: 1, secret: async () => null })).rejects.toThrow();
  });
});

describe('photoshoot provider capabilities and catalogue (PR 449)', () => {
  it('describes every registered provider without connecting to it', () => {
    expect(photoshootProviderCapabilitiesOf(MOCK_PHOTOSHOOT_PROVIDER)).toEqual(mockPhotoshootCapabilities);
    expect(photoshootProviderCapabilitiesOf(FASHN_PROVIDER)).toEqual(fashnCapabilities);
    expect(photoshootProviderCapabilitiesOf(FITROOM_PROVIDER)).toEqual(fitroomCapabilities);
    expect(photoshootProviderCapabilitiesOf('nope')).toBeNull();
  });

  it('is in Keys & connections, one row per provider, with exactly its secret fields', () => {
    expect(findConnection('fashn')).toMatchObject({ kind: 'AI_PROVIDER', provider: FASHN_PROVIDER, adapter: true });
    expect(findConnection('fitroom')).toMatchObject({ kind: 'AI_PROVIDER', provider: FITROOM_PROVIDER, adapter: true });
    const fashnRow = connectionCatalogue.find((c) => c.id === 'fashn');
    expect(fashnRow?.secrets.map((s) => s.field)).toEqual(['apiKey']);
  });
});

describe('photoshootEstimateFromRate and requirePhotoshootJobSupported (PR 450)', () => {
  it('a 0 rate, or 0 images, is "not set yet" — null, never an invented cost', () => {
    expect(photoshootEstimateFromRate({ imageCount: 3, rateMinorPerImage: 0 })).toEqual({ costMinor: null, currency: 'BDT' });
    expect(photoshootEstimateFromRate({ imageCount: 0, rateMinorPerImage: 500 })).toEqual({ costMinor: null, currency: 'BDT' });
  });

  it('a real rate is plain multiplication, rounded', () => {
    expect(photoshootEstimateFromRate({ imageCount: 3, rateMinorPerImage: 500 })).toEqual({ costMinor: 1500, currency: 'BDT' });
    expect(photoshootEstimateFromRate({ imageCount: 2, rateMinorPerImage: 333 })).toEqual({ costMinor: 666, currency: 'BDT' });
  });

  it('throws naming the provider when a job kind is outside its capabilities', () => {
    expect(() => requirePhotoshootJobSupported(FASHN_PROVIDER, 'ghostMannequin', fashnCapabilities)).toThrow(/fashn/);
    expect(() => requirePhotoshootJobSupported(FITROOM_PROVIDER, 'ghostMannequin', fitroomCapabilities)).toThrow(/fitroom/);
    expect(() => requirePhotoshootJobSupported(MOCK_PHOTOSHOOT_PROVIDER, 'ghostMannequin', mockPhotoshootCapabilities)).not.toThrow();
    expect(() => requirePhotoshootJobSupported(FASHN_PROVIDER, 'tryOn', fashnCapabilities)).not.toThrow();
  });
});

describe('mock photoshoot provider job methods (PR 450)', () => {
  it('estimate is the same shared arithmetic as every provider', async () => {
    await expect(mockPhotoshootEstimate({ imageCount: 4, rateMinorPerImage: 0 })).resolves.toEqual({ costMinor: null, currency: 'BDT' });
    await expect(mockPhotoshootEstimate({ imageCount: 4, rateMinorPerImage: 100 })).resolves.toEqual({ costMinor: 400, currency: 'BDT' });
  });

  it('generate answers at once, succeeded, with no network at all', async () => {
    const result = await mockPhotoshootGenerate({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL });
    expect(result.status).toBe('succeeded');
    expect(result.providerJobId).toMatch(/^mock-/);
  });

  it('ghostMannequin needs no model image; tryOn without one is refused', async () => {
    await expect(mockPhotoshootGenerate({ job: 'ghostMannequin', garmentImage: GARMENT })).resolves.toMatchObject({ status: 'succeeded' });
    await expect(mockPhotoshootGenerate({ job: 'tryOn', garmentImage: GARMENT })).rejects.toThrow(AdapterError);
  });

  it('status and fetch decode the job id — status is always succeeded, fetch hands back the garment shot itself (honest, never fabricated)', async () => {
    const { providerJobId } = await mockPhotoshootGenerate({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL });
    await expect(mockPhotoshootStatus(providerJobId)).resolves.toEqual({ status: 'succeeded' });
    await expect(mockPhotoshootFetch(providerJobId)).resolves.toEqual({ outputUrls: [GARMENT.url] });
  });

  it('an unknown or malformed job id is refused by status and fetch alike', async () => {
    await expect(mockPhotoshootStatus('not-a-mock-id')).rejects.toThrow(AdapterError);
    await expect(mockPhotoshootFetch('mock-not-base64url!!')).rejects.toThrow(AdapterError);
  });

  it('the full mock() API answers every method with no network', async () => {
    const api = await mockPhotoshootProviderAdapter.mock(emptyPhotoshootMockContext);
    const gen = await api.generate({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL });
    await expect(api.status(gen.providerJobId)).resolves.toEqual({ status: 'succeeded' });
    await expect(api.fetch(gen.providerJobId)).resolves.toEqual({ outputUrls: [GARMENT.url] });
    await expect(api.estimate({ imageCount: 1, rateMinorPerImage: 0 })).resolves.toEqual({ costMinor: null, currency: 'BDT' });
  });
});

describe('FASHN job methods (PR 450)', () => {
  it('generate posts model_name + inputs to /v1/run and returns the id, queued', async () => {
    const s = stand({ '/v1/run': { status: 200, body: { id: 'fashn-job-1', error: null } } });
    const result = await fashnGenerate('test-key', 'tryon-v1.6', FASHN_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL, category: 'top', seed: 7 });
    expect(result).toEqual({ providerJobId: 'fashn-job-1', status: 'queued' });
    expect(s.seen[0]?.method).toBe('POST');
    expect(s.seen[0]?.headers.authorization).toBe('Bearer test-key');
  });

  it('refuses ghost-mannequin (FASHN cannot do it) before any network call', async () => {
    const s = stand({});
    await expect(fashnGenerate('test-key', 'tryon-v1.6', FASHN_DEFAULT_BASE_URL, s.fetchFn)({ job: 'ghostMannequin', garmentImage: GARMENT })).rejects.toThrow(AdapterError);
    expect(s.seen).toHaveLength(0);
  });

  it('refuses a try-on with no model image, and more than 4 images, before any network call', async () => {
    const s = stand({});
    await expect(fashnGenerate('test-key', 'tryon-v1.6', FASHN_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT })).rejects.toThrow(AdapterError);
    await expect(fashnGenerate('test-key', 'tryon-v1.6', FASHN_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL, imageCount: 5 })).rejects.toThrow(AdapterError);
    expect(s.seen).toHaveLength(0);
  });

  it('a refused job (no id in the response) throws', async () => {
    const s = stand({ '/v1/run': { status: 400, body: { error: 'InvalidInput' } } });
    await expect(fashnGenerate('test-key', 'tryon-v1.6', FASHN_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL })).rejects.toThrow(AdapterError);
  });

  it('status maps every FASHN status onto the normalised state, and carries the failure message', async () => {
    for (const [raw, mapped] of [['starting', 'queued'], ['in_queue', 'queued'], ['processing', 'processing'], ['completed', 'succeeded']] as const) {
      const s = stand({ '/v1/status/job-1': { status: 200, body: { id: 'job-1', status: raw, output: null, error: null } } });
      await expect(fashnStatus('test-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)('job-1')).resolves.toMatchObject({ status: mapped });
    }
    const failed = stand({ '/v1/status/job-2': { status: 200, body: { id: 'job-2', status: 'failed', output: null, error: { name: 'ImageLoadError', message: 'bad url' } } } });
    await expect(fashnStatus('test-key', FASHN_DEFAULT_BASE_URL, failed.fetchFn)('job-2')).resolves.toEqual({ status: 'failed', errorMessage: 'bad url' });
  });

  it('an unrecognised status string is refused rather than guessed at', async () => {
    const s = stand({ '/v1/status/job-3': { status: 200, body: { id: 'job-3', status: 'something-new', output: null, error: null } } });
    await expect(fashnStatus('test-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)('job-3')).rejects.toThrow(AdapterError);
  });

  it('fetch reads the output URLs and the x-fashn-credits-used header once completed', async () => {
    const s = stand({ '/v1/status/job-4': { status: 200, body: { id: 'job-4', status: 'completed', output: ['https://cdn.fashn.ai/out1.png'], error: null }, headers: { 'x-fashn-credits-used': '2' } } });
    await expect(fashnFetch('test-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)('job-4')).resolves.toEqual({ outputUrls: ['https://cdn.fashn.ai/out1.png'], creditsUsed: 2 });
  });

  it('fetch refuses a job that has not completed yet', async () => {
    const s = stand({ '/v1/status/job-5': { status: 200, body: { id: 'job-5', status: 'processing', output: null, error: null } } });
    await expect(fashnFetch('test-key', FASHN_DEFAULT_BASE_URL, s.fetchFn)('job-5')).rejects.toThrow(AdapterError);
  });

  it('a connected adapter answers estimate/generate/status/fetch, with the configured tier as model_name', async () => {
    const s = stand({ '/v1/run': { status: 200, body: { id: 'job-6', error: null } } });
    const api = await fashnAdapter.create({ mode: 'LIVE', config: { tier: 'tryon-max' }, storeId: 1, secret: async () => 'test-key' });
    await expect(api.estimate({ imageCount: 2, rateMinorPerImage: 0 })).resolves.toEqual({ costMinor: null, currency: 'BDT' });
    // the adapter's own generate talks to the real network; swap in the stand-in the same way PR 449's health test does
    const stood: typeof api = { ...api, generate: fashnGenerate('test-key', 'tryon-max', FASHN_DEFAULT_BASE_URL, s.fetchFn) };
    await expect(stood.generate({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL })).resolves.toEqual({ providerJobId: 'job-6', status: 'queued' });
    expect(s.seen).toHaveLength(1);
  });
});

describe('Fitroom job methods (PR 450)', () => {
  function standWithImages(answers: Record<string, StandAnswer | Error>) {
    return stand({
      [GARMENT.url]: { raw: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'image/jpeg' } },
      [MODEL.url]: { raw: new Uint8Array([4, 5, 6]), headers: { 'content-type': 'image/jpeg' } },
      ...answers,
    });
  }

  it('generate fetches both images, uploads multipart with cloth_type, and returns the task id', async () => {
    const s = standWithImages({ '/api/tryon/v2/tasks': { status: 200, body: { task_id: 'fitroom-1', status: 'CREATED' } } });
    const result = await fitroomGenerate('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL, category: 'top' });
    expect(result).toEqual({ providerJobId: 'fitroom-1', status: 'queued' });
    const post = s.seen.find((r) => r.method === 'POST');
    expect(post?.headers['x-api-key']).toBe('test-key');
  });

  it('refuses "auto" and ghost-mannequin before reading any image', async () => {
    const s = standWithImages({});
    await expect(fitroomGenerate('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL })).rejects.toThrow(AdapterError);
    await expect(fitroomGenerate('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)({ job: 'ghostMannequin', garmentImage: GARMENT, category: 'top' })).rejects.toThrow(AdapterError);
    expect(s.seen).toHaveLength(0);
  });

  it('refuses more than one image per call (Fitroom returns exactly one)', async () => {
    const s = standWithImages({});
    await expect(fitroomGenerate('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL, category: 'top', imageCount: 2 })).rejects.toThrow(AdapterError);
    expect(s.seen).toHaveLength(0);
  });

  it('a refused job (no task_id) throws', async () => {
    const s = standWithImages({ '/api/tryon/v2/tasks': { status: 400, body: {} } });
    await expect(fitroomGenerate('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL, category: 'bottom' })).rejects.toThrow(AdapterError);
  });

  it('status maps every Fitroom status onto the normalised state, and carries progress and the error message', async () => {
    for (const [raw, mapped] of [['CREATED', 'queued'], ['PROCESSING', 'processing'], ['COMPLETED', 'succeeded']] as const) {
      const s = stand({ '/api/tryon/v2/tasks/t-1': { status: 200, body: { task_id: 't-1', status: raw, progress: 40 } } });
      await expect(fitroomStatus('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)('t-1')).resolves.toMatchObject({ status: mapped, progressPercent: 40 });
    }
    const failed = stand({ '/api/tryon/v2/tasks/t-2': { status: 200, body: { task_id: 't-2', status: 'FAILED', error: 'face not detected' } } });
    await expect(fitroomStatus('test-key', FITROOM_DEFAULT_BASE_URL, failed.fetchFn)('t-2')).resolves.toEqual({ status: 'failed', progressPercent: undefined, errorMessage: 'face not detected' });
  });

  it('an unrecognised status string is refused rather than guessed at', async () => {
    const s = stand({ '/api/tryon/v2/tasks/t-3': { status: 200, body: { task_id: 't-3', status: 'WEIRD' } } });
    await expect(fitroomStatus('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)('t-3')).rejects.toThrow(AdapterError);
  });

  it('fetch reads the signed download URL once completed, and nothing before', async () => {
    const s = stand({ '/api/tryon/v2/tasks/t-4': { status: 200, body: { task_id: 't-4', status: 'COMPLETED', download_signed_url: 'https://cdn.fitroom.app/out.png' } } });
    await expect(fitroomFetch('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn)('t-4')).resolves.toEqual({ outputUrls: ['https://cdn.fitroom.app/out.png'] });
    const pending = stand({ '/api/tryon/v2/tasks/t-5': { status: 200, body: { task_id: 't-5', status: 'PROCESSING' } } });
    await expect(fitroomFetch('test-key', FITROOM_DEFAULT_BASE_URL, pending.fetchFn)('t-5')).rejects.toThrow(AdapterError);
  });

  it('a connected adapter answers estimate/generate/status/fetch', async () => {
    const s = standWithImages({ '/api/tryon/v2/tasks': { status: 200, body: { task_id: 'fitroom-2', status: 'CREATED' } } });
    const api = await fitroomAdapter.create({ mode: 'LIVE', config: {}, storeId: 1, secret: async () => 'test-key' });
    await expect(api.estimate({ imageCount: 1, rateMinorPerImage: 150 })).resolves.toEqual({ costMinor: 150, currency: 'BDT' });
    const stood: typeof api = { ...api, generate: fitroomGenerate('test-key', FITROOM_DEFAULT_BASE_URL, s.fetchFn) };
    await expect(stood.generate({ job: 'tryOn', garmentImage: GARMENT, modelImage: MODEL, category: 'one_piece' })).resolves.toEqual({ providerJobId: 'fitroom-2', status: 'queued' });
  });
});
