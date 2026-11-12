// S15 · PR 335 — the eleventh real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `walkCompetitorJourney` is called straight, exactly
// the way `apps/web/src/lib/admin-ai/competitor-journey-api.ts`'s `competitorWalkHandler` calls it for
// `POST /api/admin/reports/competitor-walk`. No real network call to an AI provider: the global `fetch` is
// replaced for the tests that reach a live provider. The page reader itself runs on its own mock (PR 33's sample
// page), never a real network read, exactly like every other `.db.test.ts` that reaches a connection without a
// key.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { walkCompetitorJourney, type CompetitorJourneyAiDeps, type CompetitorJourneyStepInput } from './competitor-journey-dispatch';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = SYSTEM;

const oneStep: CompetitorJourneyStepInput[] = [{ label: 'Product', url: 'https://example.com/products/sample-polo' }];

describe.skipIf(!HAS_TEST_DB)('AI 360 · the Competitor Teardown journey walker on PostgreSQL (PR 335)', () => {
  let t: TestDatabase;
  let deps: CompetitorJourneyAiDeps;
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

  it("every step's own real page read always happens, even while AI 360 is off — the title and text come back, the AI note stays an honest null", async () => {
    const [step] = await walkCompetitorJourney(deps, S, 'walk-335-off', 'en', oneStep);
    expect(step!.blocked).toBe(false);
    expect(step!.title).toBeTruthy(); // the page reader's own mock sample page, never a fabricated "would act on" figure
    expect(step!.note).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('a step whose own address cannot even be read is reported plainly as blocked, with a reason — never retried, never worked around — and the walk still returns every other step', async () => {
    const steps: CompetitorJourneyStepInput[] = [{ label: 'Bad', url: 'ftp://example.com/x' }, ...oneStep];
    const result = await walkCompetitorJourney(deps, S, 'walk-335-blocked', 'en', steps);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ label: 'Bad', blocked: true, note: null });
    expect(result[0]!.blockReason).toBeTruthy();
    expect(result[1]!.blocked).toBe(false); // the next step is still walked
  });

  it('walks at most 4 steps, the honest ceiling from Blueprint B8.1 (category, product, cart, checkout), never more', async () => {
    const many: CompetitorJourneyStepInput[] = Array.from({ length: 6 }, (_, i) => ({ label: `Step ${i + 1}`, url: `https://example.com/p/${i + 1}` }));
    const result = await walkCompetitorJourney(deps, S, 'walk-335-many', 'en', many);
    expect(result).toHaveLength(4);
  });

  it("once gyani's own routed connection is ready, makes one real call per step and writes the usage ledger + diary once each — idempotently, grounded only in that step's own page text, never a price or a decision handed to the model to echo", async () => {
    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Sizes are chosen as a row of buttons; delivery and exchange windows are stated near the price."}' }], usage: { input_tokens: 400, output_tokens: 35 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [step] = await walkCompetitorJourney(deps, S, 'walk-335-live', 'en', oneStep);
    expect(step!.blocked).toBe(false);
    expect(step!.note).toBe('Sizes are chosen as a row of buttons; delivery and exchange windows are stated near the price.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('Product'); // the step's own label reached the provider
    for (const word of ['price', 'skip', 'adopt']) expect(seenBodies[0]!.toLowerCase()).not.toContain(`decide to ${word}`); // the prompt never hands the model a decision to echo

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'CompetitorJourneyStep', refId: 'walk-335-live' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'reportsCompetitorJourneyStep', providerKey: 'anthropic' });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same walk id, the same still-unchanged page text, asked again: one real call, but no second charge
    await walkCompetitorJourney(deps, S, 'walk-335-live', 'en', oneStep);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'CompetitorJourneyStep', refId: 'walk-335-live' } })).toBe(1);

    // a genuinely different step (a different URL, so the mock's own page text differs) earns its own row
    await walkCompetitorJourney(deps, S, 'walk-335-live', 'en', [{ label: 'Category', url: 'https://example.com/collections/polo' }]);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'CompetitorJourneyStep', refId: 'walk-335-live' } })).toBe(2);
  });

  it("the agent's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'reportsCompetitorJourneyStep', providerKey: 'anthropic', modelKey: 'gemini-flash', idempotencyKey: 'walk-335-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const [step] = await walkCompetitorJourney(deps, S, 'walk-335-capped', 'en', oneStep);
    expect(step!.note).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the AI call itself — the provider refuses, answers with no JSON — is swallowed, never thrown; the step\'s own real read still comes back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    const [step] = await walkCompetitorJourney(deps, S, 'walk-335-bad-answer', 'en', oneStep);
    expect(step!.blocked).toBe(false);
    expect(step!.note).toBeNull();
  });
});
