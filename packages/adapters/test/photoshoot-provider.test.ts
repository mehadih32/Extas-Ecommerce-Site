// S24 · PR 449 — the photoshoot provider adapters (C7.17): the practice provider, FASHN AI's and Fitroom's real
// `health()` against a stand-in server (never the real one, no real keys) — "not found" proves the key, an auth
// refusal does not — and their rows in Keys & connections.
import { describe, expect, it } from 'vitest';
import {
  connectionCatalogue,
  emptyPhotoshootMockContext,
  fashnAdapter,
  fashnCapabilities,
  fashnHealth,
  fitroomAdapter,
  fitroomCapabilities,
  fitroomHealth,
  FASHN_DEFAULT_BASE_URL,
  FASHN_PROVIDER,
  FITROOM_DEFAULT_BASE_URL,
  FITROOM_PROVIDER,
  findConnection,
  MOCK_PHOTOSHOOT_PROVIDER,
  mockPhotoshootCapabilities,
  mockPhotoshootProviderAdapter,
  photoshootProviderCapabilitiesOf,
} from '../src';

function stand(answers: Record<string, { status?: number; body?: unknown } | Error>) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    const a = key ? answers[key]! : { status: 404, body: {} };
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { seen, fetchFn };
}

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
