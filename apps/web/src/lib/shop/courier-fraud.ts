// S06 · PR 559, 567 — the courier fraud checks the phone-entry check asks (@extas/orders `phoneRiskCheck`), as connected.
// ~~None yet: PR 567 puts Steadfast's, Pathao's and any aggregator's own checks behind one adapter, each on its mock until
// its key arrives (A1.3).~~ PR 567: Steadfast's, Pathao's and an aggregator's own checks are adapters of kind FRAUD_CHECK
// (@extas/adapters fraud-check/), each with its row in Settings › Keys & connections. Only a connection that is switched on
// and passed its Test (out of MOCK) is asked; a practice connection never is, so no number leaves the shop before the
// owner connects a check. With none connected the owner's pattern signal reads the shop's own records, the same device
// and the same person; with several, it draws the maximum (each source's failure share, the highest one counts).
import { createConnections, fraudCheckAdapters, type Connections, type FraudCheckApi } from '@extas/adapters';
import type { PrismaClient } from '@extas/db/client';
import type { CourierFraudSource } from '@extas/orders';
import { adminDeps, type AdminDeps } from '../admin-auth';

const KIND = 'FRAUD_CHECK';

/** The fraud check connections switched on and out of practice (their adapter providers), installation-wide or the store's. */
export async function connectedFraudChecks(db: Pick<PrismaClient, 'integration'>, storeId: number): Promise<string[]> {
  const rows = await db.integration.findMany({
    where: { kind: KIND, enabled: true, archivedAt: null, mode: { not: 'MOCK' }, OR: [{ storeId }, { storeId: null }] },
    select: { provider: true },
    orderBy: { provider: 'asc' },
  });
  return [...new Set(rows.map((r) => r.provider))];
}

/** One fraud check as the phone-entry check asks it. */
export const fraudSourceOf = (api: FraudCheckApi): CourierFraudSource => ({ provider: api.source, check: (phone, signal) => api.check(phone, signal) });

const holder = globalThis as unknown as { __extasFraudLinks?: { at: number; connections: Connections } };

/** The process's connection layer for the fraud checks (its keys cached for the owner's key-cache time). */
async function links(deps: AdminDeps): Promise<Connections> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const now = Date.now();
  const hit = holder.__extasFraudLinks;
  if (hit && now - hit.at < cacheS * 1000) return hit.connections;
  const connections = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: fraudCheckAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  holder.__extasFraudLinks = { at: now, connections };
  return connections;
}

/** Every connected fraud check, ready to ask (none without a database or a connection that passed its Test). */
export async function courierFraudSources(storeId: number, deps: AdminDeps | null = adminDeps()): Promise<CourierFraudSource[]> {
  if (!deps) return [];
  const providers = await connectedFraudChecks(deps.db, storeId);
  if (!providers.length) return [];
  const c = await links(deps);
  const out: CourierFraudSource[] = [];
  for (const provider of providers) {
    try {
      const link = await c.use<FraudCheckApi>(KIND, { storeId, provider });
      if (link.mode !== 'MOCK') out.push(fraudSourceOf(link.api));
    } catch (e) {
      // a connection whose keys or settings went missing is not asked; the others still are
      console.warn(`fraud check ${provider}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    }
  }
  return out;
}
