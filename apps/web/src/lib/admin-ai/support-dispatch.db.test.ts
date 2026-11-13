// S15 · PR 325 — the first real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `supportAiReplyOption` is called straight, exactly the
// way `apps/web/src/app/admin/support/c/[id]/page.tsx` calls it as `@extas/support`'s own `opts.aiReply` — never
// through an HTTP route (there is none; AI 360's own job dispatcher has never had one). No real network call: the
// global `fetch` is replaced for the one test that reaches a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { INSTALLATION, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { SupportReplyFacts } from '@extas/support';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';
import { supportAiReplyOption, type SupportAiDeps } from './support-dispatch';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-11T10:00:00Z');
const CONVO_ID = 'c-325-sample';

const facts = (over: Partial<SupportReplyFacts> = {}): SupportReplyFacts => ({
  intent: 'status',
  complaint: null,
  question: 'amar order kothay? call me at 01812345678',
  lang: 'bn',
  ruleBasedBody: 'Hi Rahim, order EX1 is on its way with Sample Courier, tracking TRK-1.',
  order: { number: 'EX1', status: 'IN_TRANSIT', late: false },
  size: null,
  customerName: 'Rahim',
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the support reply job dispatcher on PostgreSQL (PR 325)', () => {
  let t: TestDatabase;
  let deps: SupportAiDeps;
  let resolver: SettingsResolver<typeof registry>;
  let OWNER: { staffUserId: string };

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await ensureAgentRows(t.prisma);
    await t.prisma.exchangeRate.create({ data: { storeId: S, baseCurrency: 'USD', quoteCurrency: 'BDT', rate: '119.5', effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    const owned = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: 'a long sentence for the tests', passwordChosenByOwner: true });
    OWNER = { staffUserId: owned.id };
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
    const reply = supportAiReplyOption(deps, S, CONVO_ID);
    expect(await reply(facts())).toBeNull();

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly null
    expect(await reply(facts())).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('once the agent\'s own routed connection is ready, makes one real call, masks PII first, and writes the usage ledger + diary once — idempotently', async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Hi Rahim, great news — your order EX1 is already on its way."}' }], usage: { input_tokens: 400, output_tokens: 120 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const reply = supportAiReplyOption(deps, S, CONVO_ID);
    const first = await reply(facts());
    expect(first).toBe('Hi Rahim, great news — your order EX1 is already on its way.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).not.toContain('01812345678'); // masked before it ever left the server
    expect(seenBodies[0]).toContain('[PHONE]');

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'Conversation', refId: CONVO_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'supportReply', providerKey: 'anthropic', modelKey: 'claude-sonnet', inputTokens: 400, outputTokens: 120 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBe(1);

    // the same still-open question, asked again (a repeat page view): one real call, but no second charge
    const again = await reply(facts());
    expect(again).toBe('Hi Rahim, great news — your order EX1 is already on its way.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Conversation', refId: CONVO_ID } })).toBe(1);
    expect(await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } })).toBe(1);

    // a genuinely new question (a different rule-based draft) gets its own row
    await reply(facts({ ruleBasedBody: 'Hi Rahim, a different question entirely.' }));
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Conversation', refId: CONVO_ID } })).toBe(2);
  });

  it('the agent\'s own monthly cap stops a real call before it is made, once this month\'s spend has already crossed it', async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'supportReply', providerKey: 'anthropic', modelKey: 'claude-sonnet', idempotencyKey: 'c-325-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000, createdAt: NOW },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const reply = supportAiReplyOption(deps, S, 'c-325-capped');
    expect(await reply(facts())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON — is swallowed, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    const reply = supportAiReplyOption(deps, S, 'c-325-bad-answer');
    await expect(reply(facts())).resolves.toBeNull();
  });
});
