// S15 · PR 315 — the one shared `recordAiUsage` writer on a real PostgreSQL. Called straight, not through a route
// (no HTTP handler exists for it — nothing user-facing calls it; a future job dispatcher will, same as
// `ad-alerts.db.test.ts` calls `sendCostAlerts` straight). A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { recordAiUsage, type UsageLedgerDeps } from './usage-ledger';
import { isAiError } from './errors';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-11T10:00:00Z');

describe.skipIf(!HAS_TEST_DB)('AI 360 · the shared usage ledger writer on PostgreSQL (PR 315)', () => {
  let t: TestDatabase;
  let deps: UsageLedgerDeps;

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), now: () => NOW };
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('refuses with NO_EXCHANGE_RATE rather than inventing a taka figure, while no USD rate is typed yet', async () => {
    const res = await recordAiUsage(deps, {
      idempotencyKey: 'run-1',
      storeId: S,
      modelKey: 'claude-haiku',
      usage: { kind: 'text', inputTokens: 1000, outputTokens: 500 },
    });
    expect(res).toEqual({ ok: false, error: 'NO_EXCHANGE_RATE' });
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('throws for an unknown model, a model of the wrong kind for the usage given, or an unknown agent key', async () => {
    await expect(
      recordAiUsage(deps, { idempotencyKey: 'bad-model', storeId: S, modelKey: 'not-a-model', usage: { kind: 'text', inputTokens: 1, outputTokens: 1 } }),
    ).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'UNKNOWN_MODEL');
    await expect(
      recordAiUsage(deps, { idempotencyKey: 'wrong-kind', storeId: S, modelKey: 'claude-haiku', usage: { kind: 'image', images: 1 } }),
    ).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'WRONG_KIND');
    await expect(
      recordAiUsage(deps, { idempotencyKey: 'bad-agent', storeId: S, agentKey: 'notAnAgent' as never, modelKey: 'claude-haiku', usage: { kind: 'text', inputTokens: 1, outputTokens: 1 } }),
    ).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === 'UNKNOWN_AGENT');
    expect(await t.prisma.aiUsageLedger.count()).toBe(0); // none of the above ever wrote a row
  });

  it('once a USD rate exists: computes the cost the same way the Cost Book itself would, resolves the agent id, and is idempotent on a retry', async () => {
    await t.prisma.exchangeRate.create({ data: { storeId: S, baseCurrency: 'USD', quoteCurrency: 'BDT', rate: '119.5', effectiveFrom: new Date('2026-01-01T00:00:00Z') } });

    const first = await recordAiUsage(deps, {
      idempotencyKey: 'run-ok-1',
      storeId: S,
      agentKey: 'sawdagor',
      jobTypeKey: 'seoBlogArticle',
      modelKey: 'claude-sonnet',
      usage: { kind: 'text', inputTokens: 1_000_000, outputTokens: 1_000_000 }, // 1M in + 1M out => 3,000,000 + 15,000,000 = 18,000,000 micros
      refType: 'order',
      refId: '0001',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('unreachable');
    expect(first.idempotent).toBe(false);
    expect(first.costUsdMicros).toBe(18_000_000n);
    expect(first.costMinor).toBeGreaterThan(0); // priced into BDT, not left null or zero

    const row = await t.prisma.aiUsageLedger.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.providerKey).toBe('anthropic');
    expect(row.jobTypeKey).toBe('seoBlogArticle');
    expect(row.refType).toBe('order');
    expect(row.refId).toBe('0001');
    expect(row.agentId).not.toBeNull();
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'sawdagor' } });
    expect(row.agentId).toBe(agent.id);

    // A retry with the same idempotency key (a timeout, a re-delivered job message) never double-writes.
    const retry = await recordAiUsage(deps, {
      idempotencyKey: 'run-ok-1',
      storeId: S,
      agentKey: 'sawdagor',
      jobTypeKey: 'seoBlogArticle',
      modelKey: 'claude-sonnet',
      usage: { kind: 'text', inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    expect(retry).toEqual({ ok: true, id: first.id, idempotent: true, costUsdMicros: first.costUsdMicros, costMinor: first.costMinor });
    expect(await t.prisma.aiUsageLedger.count()).toBe(1);
  });

  it('a job with no agent attached (installation-wide work) writes with a null agentId, never a guessed one', async () => {
    const res = await recordAiUsage(deps, {
      idempotencyKey: 'run-no-agent',
      storeId: S,
      modelKey: 'fashn-core',
      usage: { kind: 'image', images: 3 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    const row = await t.prisma.aiUsageLedger.findUniqueOrThrow({ where: { id: res.id } });
    expect(row.agentId).toBeNull();
    expect(row.images).toBe(3);
    expect(row.costUsdMicros).toBe(240_000n); // 3 images * 80,000 micros/image
  });

  it('feeds PR 309\'s own month-to-date sum and PR 313\'s own actual-cost column from the exact same rows', async () => {
    const monthAgg = await t.prisma.aiUsageLedger.groupBy({ by: ['agentId'], where: { agentId: { not: null }, createdAt: { gte: new Date('2026-11-01T00:00:00Z') } }, _sum: { costMinor: true } });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'sawdagor' } });
    expect(monthAgg.find((r) => r.agentId === agent.id)?._sum.costMinor).toBeGreaterThan(0);

    const jobAgg = await t.prisma.aiUsageLedger.groupBy({ by: ['jobTypeKey'], where: { jobTypeKey: 'seoBlogArticle' }, _sum: { costUsdMicros: true }, _count: { _all: true } });
    expect(jobAgg[0]?._count._all).toBe(1);
    expect(jobAgg[0]?._sum.costUsdMicros).toBe(18_000_000n);
  });
});
