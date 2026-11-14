// S15 · PR 336 — the Competitor Teardown agent's comparison/report engine, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `buildCompetitorComparisonReport` is called straight,
// exactly the way `apps/web/src/lib/admin-ai/competitor-comparison-api.ts`'s `competitorComparisonHandler` calls
// it for `POST /api/admin/reports/competitor-comparison`. No real network call to an AI provider: the global
// `fetch` is replaced for the tests that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { buildCompetitorComparisonReport, pairCompetitorSteps, type CompetitorComparisonAiDeps } from './competitor-comparison-dispatch';
import type { CompetitorJourneyStepResult } from './competitor-journey-dispatch';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = SYSTEM;

const theirStep = (over: Partial<CompetitorJourneyStepResult> = {}): CompetitorJourneyStepResult => ({ label: 'Product', url: 'https://competitor.example/p/1', title: 'Their Polo', blocked: false, blockReason: null, note: 'A grid of polos with a sale badge on every tile.', ...over });
const ourStep = (over: Partial<CompetitorJourneyStepResult> = {}): CompetitorJourneyStepResult => ({ label: 'Product', url: 'https://extas.com.bd/p/1', title: 'Our Polo', blocked: false, blockReason: null, note: 'A filterable grid with no always-on discount badges.', ...over });

describe.skipIf(!HAS_TEST_DB)('AI 360 · the Competitor Teardown comparison/report engine on PostgreSQL (PR 336)', () => {
  let t: TestDatabase;
  let deps: CompetitorComparisonAiDeps;
  let resolver: SettingsResolver<typeof registry>;

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await ensureAgentRows(t.prisma);
    await t.prisma.exchangeRate.create({ data: { storeId: S, baseCurrency: 'USD', quoteCurrency: 'BDT', rate: '119.5', effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    deps = { db: t.prisma, resolver, vault: { get: async () => 'sk-test-key' }, now: () => NOW };
  });
  afterAll(async () => {
    await t?.drop();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pairs steps by label, case- and whitespace-insensitive, and marks a step with no matching page of ours as honestly null — never invented', () => {
    const paired = pairCompetitorSteps([theirStep({ label: ' Category ' }), theirStep({ label: 'Checkout' })], [ourStep({ label: 'category' })]);
    expect(paired[0]!.ours).not.toBeNull();
    expect(paired[1]!.ours).toBeNull();
  });

  it('the deterministic side-by-side table always comes back, even while AI 360 is off — the judgement fields stay an honest null', async () => {
    const report = await buildCompetitorComparisonReport(deps, S, 'cmp-336-off', 'en', [theirStep()], [ourStep()]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.theirs.title).toBe('Their Polo');
    expect(report.rows[0]!.ours!.title).toBe('Our Polo');
    expect(report.rows[0]!.verdict).toBeNull();
    expect(report.rows[0]!.recommendation).toBeNull();
    expect(report.claudesView).toBeNull();
    expect(report.extasAdvantages).toEqual([]);
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('a step whose own real read was blocked is still returned, and still judged on the competitor side alone once a provider is ready', async () => {
    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"rows": [{"label": "Checkout", "verdict": "we_better", "recommendation": "skip", "reason": "Their checkout could not be read."}], "claudesView": "", "extasAdvantages": []}' }], usage: { input_tokens: 300, output_tokens: 60 } }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const report = await buildCompetitorComparisonReport(deps, S, 'cmp-336-blocked', 'en', [theirStep({ label: 'Checkout', blocked: true, blockReason: 'timed out', title: null, note: null })], []);
    expect(report.rows[0]!.theirs.blocked).toBe(true);
    expect(report.rows[0]!.ours).toBeNull();
    expect(report.rows[0]!.verdict).toBe('we_better');
    expect(report.rows[0]!.recommendation).toBe('skip');
  });

  it("once gyani's own routed connection is ready, makes one real call and writes the usage ledger + diary once — idempotently — grounded only in each row's own already-grounded facts, never a price or a policy decision", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"rows": [{"label": "Product", "verdict": "they_better", "recommendation": "pick_with_changes", "reason": "Their sale badge draws the eye, but always-on discounting is not our positioning."}], "claudesView": "", "extasAdvantages": ["No always-on discount badges"]}' }], usage: { input_tokens: 500, output_tokens: 90 } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const report = await buildCompetitorComparisonReport(deps, S, 'cmp-336-live', 'en', [theirStep()], [ourStep()]);
    expect(report.rows[0]!.verdict).toBe('they_better');
    expect(report.rows[0]!.recommendation).toBe('pick_with_changes');
    expect(report.extasAdvantages).toEqual(['No always-on discount badges']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'CompetitorComparisonReport', refId: 'cmp-336-live' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'reportsCompetitorComparison', providerKey: 'anthropic' });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id, refType: 'CompetitorComparisonReport' } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same report id, the same still-unchanged side-by-side table, asked again: one real call, but no second charge
    await buildCompetitorComparisonReport(deps, S, 'cmp-336-live', 'en', [theirStep()], [ourStep()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'CompetitorComparisonReport', refId: 'cmp-336-live' } })).toBe(1);

    // a genuinely different table (a different note on their side) earns its own row
    await buildCompetitorComparisonReport(deps, S, 'cmp-336-live', 'en', [theirStep({ note: 'A different note entirely.' })], [ourStep()]);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'CompetitorComparisonReport', refId: 'cmp-336-live' } })).toBe(2);
  });

  it("the agent's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'reportsCompetitorComparison', providerKey: 'anthropic', modelKey: 'gemini-flash', idempotencyKey: 'cmp-336-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const report = await buildCompetitorComparisonReport(deps, S, 'cmp-336-capped', 'en', [theirStep()], [ourStep()]);
    expect(report.rows[0]!.verdict).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the AI call itself — the provider refuses, answers with no JSON, or judges only a label that was never given — is swallowed, never thrown; the deterministic table still comes back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    const r1 = await buildCompetitorComparisonReport(deps, S, 'cmp-336-bad-answer', 'en', [theirStep()], [ourStep()]);
    expect(r1.rows[0]!.verdict).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"rows": [{"label": "Nowhere", "verdict": "we_better", "recommendation": "skip", "reason": "x"}]}' }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const r2 = await buildCompetitorComparisonReport(deps, S, 'cmp-336-invented-label', 'en', [theirStep()], [ourStep()]);
    expect(r2.rows[0]!.verdict).toBeNull();
  });

  it('builds the report for every given step even with no matching page of ours at all — the gap is stated by `ours: null`, never invented', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const report = await buildCompetitorComparisonReport(deps, S, 'cmp-336-no-ours', 'en', [theirStep({ label: 'Category' })], []);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]!.ours).toBeNull();
  });
});
