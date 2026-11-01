// S06 · PR 567 on a real PostgreSQL (a throwaway database; skipped without TEST_DATABASE_ADMIN_URL): which courier fraud
// checks the phone-entry check asks. Nothing until a FRAUD_CHECK connection is switched on and out of practice (a MOCK
// row is never asked, so no number leaves the shop before the owner connects one); a switched-off, removed or other
// store's row is not this store's; a connection whose keys went missing is skipped, the others still asked. The answers
// come from a stand-in server (never a real courier). Every key, address and number is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { Vault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { connectedFraudChecks, courierFraudSources } from './courier-fraud';

const PHONE = '+8801700000567'; // hardcode-ok: a made-up test number
const AGG = 'https://agg.example.test/v1/check';

describe.skipIf(!HAS_TEST_DB)('PR 567 · the connected courier fraud checks (PostgreSQL)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let S = 0;
  let OTHER = 0;
  const keys = new Map<string, string>([['fraudAggregator.apiKey', 'sample-agg-key-567']]);
  const vault = { get: async (name: string) => keys.get(name) ?? null } as unknown as Vault;
  const seen: string[] = [];
  const row = (data: { provider: string; mode: 'MOCK' | 'LIVE'; enabled?: boolean; storeId?: number | null; config?: object; archivedAt?: Date | null }) =>
    t.prisma.integration.create({ data: { kind: 'FRAUD_CHECK', name: `Sample ${data.provider}`, secretNames: [], enabled: true, storeId: S, ...data } });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ courierData: { summary: { total_delivered: 2, total_cancelled: 8 } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch);
    t = await createTestDatabase('courier_fraud');
    [S, OTHER] = await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault };
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('none connected: nothing is asked; no database: nothing is asked', async () => {
    expect(await connectedFraudChecks(t.prisma, S)).toEqual([]);
    expect(await courierFraudSources(S, deps)).toEqual([]);
    expect(await courierFraudSources(S, null)).toEqual([]);
  });

  it('a practice (MOCK), switched-off, removed or other store’s row is never asked', async () => {
    await row({ provider: 'steadfastFraud', mode: 'MOCK' });
    await row({ provider: 'pathaoFraud', mode: 'LIVE', enabled: false });
    await row({ provider: 'fraudAggregator', mode: 'LIVE', archivedAt: new Date(), config: { baseUrl: AGG } });
    await row({ provider: 'fraudAggregator', mode: 'LIVE', storeId: OTHER, config: { baseUrl: AGG } });
    expect(await connectedFraudChecks(t.prisma, S)).toEqual([]);
    expect(await courierFraudSources(S, deps)).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('a connection out of practice is asked; one whose keys went missing is skipped, the others still asked', async () => {
    await t.prisma.integration.create({ data: { kind: 'FRAUD_CHECK', provider: 'fraudAggregator', name: 'Live aggregator', mode: 'LIVE', enabled: true, storeId: S, secretNames: [], config: { baseUrl: AGG } } });
    // Pathao's check switched on with no keys in the vault: its client cannot be made, so it is not asked
    await t.prisma.integration.updateMany({ where: { provider: 'pathaoFraud' }, data: { enabled: true } });
    expect(await connectedFraudChecks(t.prisma, S)).toEqual(['fraudAggregator', 'pathaoFraud']);
    const sources = await courierFraudSources(S, deps);
    expect(sources.map((s) => s.provider)).toEqual(['aggregator']);
    expect(await sources[0]!.check(PHONE, new AbortController().signal)).toEqual({ delivered: 2, cancelled: 8 });
    expect(seen).toEqual([`${AGG}?phone=01700000567`]);
    // the other store still has its own aggregator only
    expect(await connectedFraudChecks(t.prisma, OTHER)).toEqual(['fraudAggregator']);
  });
});
