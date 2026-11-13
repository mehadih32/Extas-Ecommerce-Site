// S15 · PR 334 — the tenth real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `guideQaAnswer` is called straight, exactly the way
// `apps/web/src/lib/admin-shell/api.ts`'s `guideAskHandler` calls it for `POST /api/admin/guide/ask`. No real
// network call: the global `fetch` is replaced for the tests that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import type { Block } from '../admin-shell/guide';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { guideQaAnswer, type GuideQaAiDeps } from './guide-qa-dispatch';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = SYSTEM;
const PAGE_ID = 'products/stock';

const GUIDE_BLOCKS: Block[] = [
  { t: 'h', level: 2, c: [{ t: 'text', v: 'এটা কী' }] },
  { t: 'p', c: [{ t: 'text', v: 'যে রং-সাইজ প্রায় শেষ, চেকআউটে আটকে রাখা মাল বাদ দিয়ে দেখায়।' }] },
];
const guide = (over: Partial<{ title: string; blocks: Block[] }> = {}) => ({ title: 'Low stock', blocks: GUIDE_BLOCKS, ...over });

describe.skipIf(!HAS_TEST_DB)('AI 360 · the System Q&A agent job dispatcher on PostgreSQL (PR 334)', () => {
  let t: TestDatabase;
  let deps: GuideQaAiDeps;
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
    expect(await guideQaAnswer(deps, S, PAGE_ID, 'bn', 'এটা কীভাবে গোনা হয়?', guide())).toBeNull();

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'prohori', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly null
    expect(await guideQaAnswer(deps, S, PAGE_ID, 'bn', 'এটা কীভাবে গোনা হয়?', guide())).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('answers null without even checking anything, when the question or the guide text is empty', async () => {
    expect(await guideQaAnswer(deps, S, PAGE_ID, 'bn', '  ', guide())).toBeNull();
    expect(await guideQaAnswer(deps, S, PAGE_ID, 'bn', 'এটা কী?', guide({ blocks: [] }))).toBeNull();
  });

  it("once prohori's own routed connection is ready, makes one real call and writes the usage ledger + diary once — idempotently, grounded only in the guide's own text", async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'prohori', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "চেকআউটে আটকে রাখা মাল বাদ দিয়ে, বিক্রি করা যায় এমন সংখ্যা দিয়েই গোনা হয়।"}' }], usage: { input_tokens: 80, output_tokens: 30 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const answer = await guideQaAnswer(deps, S, PAGE_ID, 'bn', 'এটা কীভাবে গোনা হয়?', guide());
    expect(answer).toBe('চেকআউটে আটকে রাখা মাল বাদ দিয়ে, বিক্রি করা যায় এমন সংখ্যা দিয়েই গোনা হয়।');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('চেকআউটে আটকে রাখা মাল বাদ দিয়ে'); // the page's own guide text reached the provider
    expect(seenBodies[0]).toContain('এটা কীভাবে গোনা হয়?'); // the owner's own question reached the provider

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'AdminGuidePage', refId: PAGE_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'adminGuideAnswer', providerKey: 'anthropic' });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'prohori' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same question, against the same still-unchanged guide (a repeat press): one real call, but no second charge
    const again = await guideQaAnswer(deps, S, PAGE_ID, 'bn', 'এটা কীভাবে গোনা হয়?', guide());
    expect(again).toBe('চেকআউটে আটকে রাখা মাল বাদ দিয়ে, বিক্রি করা যায় এমন সংখ্যা দিয়েই গোনা হয়।');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'AdminGuidePage', refId: PAGE_ID } })).toBe(1);

    // a genuinely different question earns its own row
    await guideQaAnswer(deps, S, PAGE_ID, 'bn', 'এটা কবে আপডেট হয়?', guide());
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'AdminGuidePage', refId: PAGE_ID } })).toBe(2);
  });

  it("threads `locale` through to the model call (an English-interface owner asks the same question, gets its own charge, never the Bengali-locale answer's cached row)", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const content = JSON.parse(init.body as string).messages[0].content as string;
      expect(content).toContain('Answer in English');
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "It is counted after what checkout already holds back."}' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const answer = await guideQaAnswer(deps, S, PAGE_ID, 'en', 'এটা কীভাবে গোনা হয়?', guide());
    expect(answer).toBe('It is counted after what checkout already holds back.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // the 'bn'-locale row from the previous test stays its own charge; this English-locale answer to the identical
    // question earns a fresh one (the idempotency key hashes the locale too)
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'AdminGuidePage', refId: PAGE_ID } })).toBe(3);
  });

  it("the agent's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'prohori' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'adminGuideAnswer', providerKey: 'anthropic', modelKey: 'gemini-flash', idempotencyKey: 'guide-qa-334-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'prohori', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await guideQaAnswer(deps, S, 'products/stock-capped', 'bn', 'এটা কীভাবে গোনা হয়?', guide())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'prohori', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON — is swallowed, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(guideQaAnswer(deps, S, 'products/stock-bad-answer', 'bn', 'এটা কীভাবে গোনা হয়?', guide())).resolves.toBeNull();
  });
});
