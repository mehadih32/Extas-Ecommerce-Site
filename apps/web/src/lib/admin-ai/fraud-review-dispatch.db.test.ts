// S15 · PR 329 — the fifth real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `fraudReviewNote`/`fraudReviewOption` are called
// straight, exactly the way `apps/web/src/lib/admin-orders/detail.ts` calls `fraudReviewOption` for each open
// review card's own already-built `AlertExplainView` words — never through an HTTP route (there is none). No real
// network call: the global `fetch` is replaced for the tests that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';
import { fraudReviewNote, fraudReviewOption, type FraudReviewAiDeps, type FraudReviewFacts } from './fraud-review-dispatch';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = { staffUserId: 'system' } as never;
const ALERT_ID = 'alert-329-sample';

const facts = (over: Partial<FraudReviewFacts> = {}): FraudReviewFacts => ({
  kind: 'duplicate',
  severity: 'High',
  why: ['A · Same customer, same items again · 100% sure · within 5 days · proposes cancel'],
  matches: ['EX-1002 · Processing · 3 Nov · ৳1,200'],
  history: ['3 orders, 2 delivered'],
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the fraud review job dispatcher on PostgreSQL (PR 329)', () => {
  let t: TestDatabase;
  let deps: FraudReviewAiDeps;
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

  it('answers null — never a guess — while AI 360 is off, the agent is paused, or no connection is ready for the routed data class', async () => {
    expect(await fraudReviewNote(deps, S, ALERT_ID, 'en', facts())).toBeNull();

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly null
    expect(await fraudReviewNote(deps, S, ALERT_ID, 'en', facts())).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('answers null without even checking anything, when the card itself has nothing to explain', async () => {
    expect(await fraudReviewNote(deps, S, ALERT_ID, 'en', { kind: 'risk', severity: null, why: [], matches: [], history: [] })).toBeNull();
  });

  it("once gyani's own routed connection is ready, makes one real call and writes the usage ledger + diary once — idempotently, never a decision word", async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "This order was raised because it repeats another order\'s items within a few days."}' }], usage: { input_tokens: 90, output_tokens: 24 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const note = await fraudReviewNote(deps, S, ALERT_ID, 'en', facts());
    expect(note).toBe("This order was raised because it repeats another order's items within a few days.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('EX-1002'); // the card's own already-decided words reached the provider
    expect(seenBodies[0]).not.toMatch(/\bRahim\b/); // never a customer name — facts carry none beyond the card's own words
    for (const word of ['cancel', 'approve', 'hold', 'block']) expect(seenBodies[0]!.toLowerCase()).not.toContain(`decide to ${word}`); // the prompt never hands the model a decision to echo

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'FraudAlert', refId: ALERT_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'orderFraudJudge', providerKey: 'anthropic', modelKey: 'claude-opus', inputTokens: 90, outputTokens: 24 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same still-open alert, asked again (a repeat page view): one real call, but no second charge
    const again = await fraudReviewNote(deps, S, ALERT_ID, 'en', facts());
    expect(again).toBe("This order was raised because it repeats another order's items within a few days.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'FraudAlert', refId: ALERT_ID } })).toBe(1);

    // a genuinely different card (re-run after an edit, PR 142) gets its own row
    await fraudReviewNote(deps, S, ALERT_ID, 'en', facts({ history: ['4 orders, 2 delivered'] }));
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'FraudAlert', refId: ALERT_ID } })).toBe(2);
  });

  it("the agent's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'orderFraudJudge', providerKey: 'anthropic', modelKey: 'claude-opus', idempotencyKey: 'alert-329-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fraudReviewNote(deps, S, 'alert-329-capped', 'en', facts())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON — is swallowed, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(fraudReviewNote(deps, S, 'alert-329-bad-answer', 'en', facts())).resolves.toBeNull();
  });

  it('fraudReviewOption threads the given words straight through, with no second lookup of its own', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Explained from the card alone."}' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const option = fraudReviewOption(deps, S, 'alert-329-option', 'en');
    expect(await option(facts({ history: ['option-call-own-history'] }))).toBe('Explained from the card alone.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
