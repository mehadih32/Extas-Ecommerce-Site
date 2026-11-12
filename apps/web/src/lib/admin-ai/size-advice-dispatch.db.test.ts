// S15 · PR 328 — the fourth real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `sizeAdviceNote`/`sizeAdviceOption` are called
// straight, exactly the way `apps/web/src/app/admin/support/c/[id]/page.tsx` calls `sizeAdviceOption` as
// `@extas/support`'s own `opts.sizeAdvice` — never through an HTTP route (there is none). No real network call:
// the global `fetch` is replaced for the tests that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';
import { sizeAdviceNote, sizeAdviceOption, type SizeAdviceAiDeps, type SizeAdviceFacts } from './size-advice-dispatch';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = { staffUserId: 'system' } as never;
const CONVO_ID = 'c-328-sample';

const facts = (over: Partial<SizeAdviceFacts> = {}): SizeAdviceFacts => ({
  sizeLabel: 'L',
  nextSizeLabel: 'XL',
  fieldLabel: 'Chest',
  valueInch: 44,
  needInch: 42,
  bodyInch: 40,
  easeInch: 2,
  covered: true,
  garment: 'polo',
  heightIn: 67,
  weightKg: 68,
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the size advice job dispatcher on PostgreSQL (PR 328)', () => {
  let t: TestDatabase;
  let deps: SizeAdviceAiDeps;
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
    expect(await sizeAdviceNote(deps, S, CONVO_ID, 'en', facts())).toBeNull();

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly null
    expect(await sizeAdviceNote(deps, S, CONVO_ID, 'en', facts())).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('once gyani\'s own routed connection is ready, makes one real call and writes the usage ledger + diary once — idempotently, never changing the size', async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Size L fits because its chest of 44in comfortably covers your need."}' }], usage: { input_tokens: 70, output_tokens: 18 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const note = await sizeAdviceNote(deps, S, CONVO_ID, 'en', facts());
    expect(note).toBe('Size L fits because its chest of 44in comfortably covers your need.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('44'); // the real chart measure reached the provider
    expect(seenBodies[0]).not.toMatch(/\bRahim\b/); // never a customer name — facts carry none

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'Conversation', refId: CONVO_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'supportSizeAdvice', providerKey: 'anthropic', modelKey: 'gemini-flash', inputTokens: 70, outputTokens: 18 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same still-open answer, asked again (a repeat page view): one real call, but no second charge
    const again = await sizeAdviceNote(deps, S, CONVO_ID, 'en', facts());
    expect(again).toBe('Size L fits because its chest of 44in comfortably covers your need.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Conversation', refId: CONVO_ID } })).toBe(1);

    // a genuinely different answer (a different size, or different measures) gets its own row
    await sizeAdviceNote(deps, S, CONVO_ID, 'en', facts({ sizeLabel: 'XL', heightIn: 70 }));
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Conversation', refId: CONVO_ID } })).toBe(2);
  });

  it('the agent\'s own monthly cap stops a real call before it is made, once this month\'s spend has already crossed it', async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'supportSizeAdvice', providerKey: 'anthropic', modelKey: 'gemini-flash', idempotencyKey: 'c-328-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sizeAdviceNote(deps, S, 'c-328-capped', 'en', facts())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON — is swallowed, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(sizeAdviceNote(deps, S, 'c-328-bad-answer', 'en', facts())).resolves.toBeNull();
  });

  it('sizeAdviceOption answers null without ever calling the real job when the caller\'s own facts lookup finds no chart', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const option = sizeAdviceOption(deps, S, 'c-328-no-chart', async () => null);
    expect(await option('product-without-chart', { heightIn: 67, weightKg: 68 }, 'en')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
