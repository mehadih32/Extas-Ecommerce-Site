// S15 · PR 330 — the sixth real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `approvalExplainNote`/`approvalExplainOption` are
// called straight, exactly the way the Growth agent page calls `approvalExplainOption` for each waiting
// proposal's own already-built `what`/`why` words — never through an HTTP route (there is none). No real network
// call: the global `fetch` is replaced for the tests that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';
import { approvalExplainNote, approvalExplainOption, type ApprovalExplainAiDeps, type ApprovalExplainFacts } from './approval-explain-dispatch';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = { staffUserId: 'system' } as never;
const ITEM_ID = 'approval-330-sample';

const facts = (over: Partial<ApprovalExplainFacts> = {}): ApprovalExplainFacts => ({
  title: 'Pause Winter Polos: campaign spent ৳1,200 with no delivered order',
  why: ['spent ৳1,200 over 3 Oct–9 Oct with 0 delivered orders'],
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the approval-explain job dispatcher on PostgreSQL (PR 330)', () => {
  let t: TestDatabase;
  let deps: ApprovalExplainAiDeps;
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
    expect(await approvalExplainNote(deps, S, ITEM_ID, 'en', facts())).toBeNull();

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly null
    expect(await approvalExplainNote(deps, S, ITEM_ID, 'en', facts())).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('answers null without even checking anything, when the item itself has no title to explain', async () => {
    expect(await approvalExplainNote(deps, S, ITEM_ID, 'en', { title: ' ', why: [] })).toBeNull();
  });

  it("once gyani's own routed connection is ready, makes one real call and writes the usage ledger + diary once — idempotently, never a decision word", async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "The system is asking because this campaign has been spending with no delivered order."}' }], usage: { input_tokens: 60, output_tokens: 18 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const note = await approvalExplainNote(deps, S, ITEM_ID, 'en', facts());
    expect(note).toBe('The system is asking because this campaign has been spending with no delivered order.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('Winter Polos'); // the item's own already-decided words reached the provider
    for (const word of ['approve', 'reject', 'pause', 'raise', 'lower']) expect(seenBodies[0]!.toLowerCase()).not.toContain(`decide to ${word}`); // the prompt never hands the model a decision to echo

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'AiApprovalRequest', refId: ITEM_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'adminApprovalExplain', providerKey: 'anthropic', modelKey: 'claude-haiku', inputTokens: 60, outputTokens: 18 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same still-waiting item, asked again (a repeat page view): one real call, but no second charge
    const again = await approvalExplainNote(deps, S, ITEM_ID, 'en', facts());
    expect(again).toBe('The system is asking because this campaign has been spending with no delivered order.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'AiApprovalRequest', refId: ITEM_ID } })).toBe(1);

    // the same item with a changed reason (the figures moved since the last run) gets its own row
    await approvalExplainNote(deps, S, ITEM_ID, 'en', facts({ why: ['spent ৳1,500 over 4 Oct–10 Oct with 0 delivered orders'] }));
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'AiApprovalRequest', refId: ITEM_ID } })).toBe(2);
  });

  it("the agent's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'adminApprovalExplain', providerKey: 'anthropic', modelKey: 'claude-haiku', idempotencyKey: 'approval-330-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await approvalExplainNote(deps, S, 'approval-330-capped', 'en', facts())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON — is swallowed, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(approvalExplainNote(deps, S, 'approval-330-bad-answer', 'en', facts())).resolves.toBeNull();
  });

  it('approvalExplainOption threads the given words straight through, with no second lookup of its own', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Explained from the item alone."}' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const option = approvalExplainOption(deps, S, 'approval-330-option', 'en');
    expect(await option(facts({ why: ['option-call-own-reason'] }))).toBe('Explained from the item alone.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
