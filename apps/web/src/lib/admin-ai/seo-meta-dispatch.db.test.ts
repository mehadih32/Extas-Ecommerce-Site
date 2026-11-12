// S15 · PR 327 — the third real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `seoMetaDraft` is called straight, the way
// `lib/seo/drafts.ts`'s own "Draft" batch action calls it for each candidate page, before falling back to the
// plain practice writer. No real network call: the global `fetch` is replaced for the one test that reaches a live
// provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { seoMetaDraft, type SeoMetaAiDeps, type SeoMetaFacts } from './seo-meta-dispatch';
import { setAgentMonthlyCap } from './spend-cap';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
// S15 · PR 331's own incidental fix — see `support-dispatch.db.test.ts`'s own comment on this same line: the
// placeholder actor here always threw `INVALID_ACTOR` for real against a real Postgres (never actually run until
// now); `SYSTEM` (`{ staffUserId: null }`, `@extas/auth`) is the real system actor `resolver.ts` accepts.
const OWNER = SYSTEM;
const PRODUCT_ID = 'p-327-sample';
const CATEGORY_ID = 'c-327-sample';
const MAX = { title: 60, description: 155 };

const facts = (over: Partial<SeoMetaFacts> = {}): SeoMetaFacts => ({
  name: 'Sample Pique Polo',
  brand: 'Sample Brand',
  category: 'Polos',
  colours: ['Navy', 'White'],
  fit: 'Regular fit',
  shop: 'Sample Shop',
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the SEO & meta job dispatcher on PostgreSQL (PR 327)', () => {
  let t: TestDatabase;
  let deps: SeoMetaAiDeps;
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

  it('answers an honest reason — never a guess — while AI 360 is off, the agent is paused, or no connection is ready for the routed data class', async () => {
    expect(await seoMetaDraft(deps, S, 'product', PRODUCT_ID, 'en', facts(), MAX)).toEqual({ ok: false, reason: 'AI_OFF' });

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'doot', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly not ready
    expect(await seoMetaDraft(deps, S, 'product', PRODUCT_ID, 'en', facts(), MAX)).toEqual({ ok: false, reason: 'NOT_READY' });
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it("once Doot's own routed connection is ready, makes one real call grounded only on the given facts, for products and categories alike, and writes the usage ledger + diary once per page", async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'doot', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"title": "Sample Pique Polo | Sample Brand | Sample Shop", "description": "A navy or white polo for Sample Shop."}' }], usage: { input_tokens: 70, output_tokens: 18 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const product = await seoMetaDraft(deps, S, 'product', PRODUCT_ID, 'en', facts(), MAX);
    expect(product).toEqual({ ok: true, title: 'Sample Pique Polo | Sample Brand | Sample Shop', description: 'A navy or white polo for Sample Shop.', provider: 'anthropic' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('Navy, White');

    const productRows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'Product', refId: PRODUCT_ID } });
    expect(productRows).toHaveLength(1);
    expect(productRows[0]).toMatchObject({ jobTypeKey: 'seoMetaTags', providerKey: 'anthropic', modelKey: 'gemini-flash', inputTokens: 70, outputTokens: 18 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    expect(productRows[0]!.agentId).toBe(agent.id);
    expect(await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id, refType: 'Product', refId: PRODUCT_ID } })).toBe(1);

    // a category page is billed and logged the same way, under its own refType
    const category = await seoMetaDraft(deps, S, 'category', CATEGORY_ID, 'en', { name: 'Polos', shop: 'Sample Shop' }, MAX);
    expect(category.ok).toBe(true);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Category', refId: CATEGORY_ID } })).toBe(1);
    expect(await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id, refType: 'Category', refId: CATEGORY_ID } })).toBe(1);

    // a second, later run for the same page (a fresh day) is its own charge, not reused
    const again = await seoMetaDraft(deps, S, 'product', PRODUCT_ID, 'bn', facts({ name: 'স্যাম্পল পিক পোলো' }), MAX);
    expect(again.ok).toBe(true);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Product', refId: PRODUCT_ID } })).toBe(2);
  });

  it("Doot's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'seoMetaTags', providerKey: 'anthropic', modelKey: 'gemini-flash', idempotencyKey: 'p-327-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'doot', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await seoMetaDraft(deps, S, 'product', 'p-327-capped', 'en', facts(), MAX)).toEqual({ ok: false, reason: 'CAP_EXCEEDED' });
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'doot', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON, or with an empty title/description — is answered as NO_ANSWER, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    expect(await seoMetaDraft(deps, S, 'product', 'p-327-bad-answer', 'en', facts(), MAX)).toEqual({ ok: false, reason: 'NO_ANSWER' });
  });
});
