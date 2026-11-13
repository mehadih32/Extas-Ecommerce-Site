// S15 · PR 332 — the eighth real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `studioDetailNote`/`studioDetailOption` are called
// straight — there is no HTTP route test here beyond the handler module itself, no caller exists yet (S24's own
// Studio admin pages are PR 445+, not built). No real network call: the global `fetch` is replaced for the tests
// that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';
import { studioDetailNote, studioDetailOption, type StudioDetailAiDeps, type StudioDetailFacts } from './studio-detail-dispatch';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = SYSTEM;
const PRODUCT_ID = 'product-332-sample';

const facts = (over: Partial<StudioDetailFacts> = {}): StudioDetailFacts => ({
  nameEn: 'Sample Pique Polo',
  brand: 'Sample Brand',
  category: 'Polos',
  fabric: 'Cotton pique',
  colours: ['Navy', 'White'],
  sizes: ['M', 'L'],
  careEn: 'Machine wash cold',
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the photoshoot studio detail-finder job dispatcher on PostgreSQL (PR 332)', () => {
  let t: TestDatabase;
  let deps: StudioDetailAiDeps;
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
    expect(await studioDetailNote(deps, S, PRODUCT_ID, 'en', facts())).toBeNull();

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly null
    expect(await studioDetailNote(deps, S, PRODUCT_ID, 'en', facts())).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('answers null without even checking anything, when the product has no name to ground a note on', async () => {
    expect(await studioDetailNote(deps, S, PRODUCT_ID, 'en', facts({ nameEn: ' ' }))).toBeNull();
  });

  it("once gyani's own routed connection is ready, makes one real call and writes the usage ledger + diary once — idempotently, never a decision word", async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Keep the cotton pique texture and the navy/white colours true to the sample."}' }], usage: { input_tokens: 70, output_tokens: 22 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const note = await studioDetailNote(deps, S, PRODUCT_ID, 'en', facts());
    expect(note).toBe('Keep the cotton pique texture and the navy/white colours true to the sample.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('Cotton pique'); // the product's own already-saved attributes reached the provider
    expect(seenBodies[0]).not.toMatch(/\bRahim\b/); // never a customer name — facts carry none at all
    for (const word of ['regenerate', 'keep this photo', 'discard']) expect(seenBodies[0]!.toLowerCase()).not.toContain(`decide to ${word}`); // the prompt never hands the model a shoot decision to echo

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'Product', refId: PRODUCT_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'studioDetailFinder', providerKey: 'anthropic' });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same product's own still-unchanged facts, asked again (a repeat view): one real call, but no second charge
    const again = await studioDetailNote(deps, S, PRODUCT_ID, 'en', facts());
    expect(again).toBe('Keep the cotton pique texture and the navy/white colours true to the sample.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Product', refId: PRODUCT_ID } })).toBe(1);

    // a genuinely different set of facts (the product was edited) gets its own row
    await studioDetailNote(deps, S, PRODUCT_ID, 'en', facts({ fabric: 'Cotton-linen blend' }));
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Product', refId: PRODUCT_ID } })).toBe(2);
  });

  it("the agent's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, createdAt: NOW, jobTypeKey: 'studioDetailFinder', providerKey: 'anthropic', modelKey: 'gemini-flash', idempotencyKey: 'product-332-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await studioDetailNote(deps, S, 'product-332-capped', 'en', facts())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON — is swallowed, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(studioDetailNote(deps, S, 'product-332-bad-answer', 'en', facts())).resolves.toBeNull();
  });

  it('studioDetailOption threads the given facts straight through, with no second lookup of its own', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Keep the facts given."}' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const option = studioDetailOption(deps, S, 'product-332-option', 'en');
    expect(await option(facts({ fabric: 'option-call-own-fabric' }))).toBe('Keep the facts given.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
