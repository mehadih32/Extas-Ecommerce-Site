// S15 · PR 326 — the second real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `productDescriptionDraft` is called straight, the way
// the product content API route (PR 326's own "Write with AI" button) calls it — never on a plain page view. No
// real network call: the global `fetch` is replaced for the one test that reaches a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { productDescriptionDraft, type ProductContentAiDeps, type ProductDescriptionFacts } from './product-content-dispatch';
import { setAgentMonthlyCap } from './spend-cap';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
// S15 · PR 331's own incidental fix — see `support-dispatch.db.test.ts`'s own comment on this same line: the
// placeholder actor here always threw `INVALID_ACTOR` for real against a real Postgres (never actually run until
// now); `SYSTEM` (`{ staffUserId: null }`, `@extas/auth`) is the real system actor `resolver.ts` accepts.
const OWNER = SYSTEM;
const PRODUCT_ID = 'p-326-sample';

const facts = (over: Partial<ProductDescriptionFacts> = {}): ProductDescriptionFacts => ({
  nameEn: 'Sample Pique Polo',
  brand: 'Sample Brand',
  category: 'Polos',
  colours: ['Navy', 'White'],
  sizes: ['S', 'M', 'L'],
  fabric: 'Cotton pique',
  careEn: 'Machine wash cold.',
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the product content job dispatcher on PostgreSQL (PR 326)', () => {
  let t: TestDatabase;
  let deps: ProductContentAiDeps;
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
    expect(await productDescriptionDraft(deps, S, PRODUCT_ID, 'en', facts())).toEqual({ ok: false, reason: 'AI_OFF' });

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'doot', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly not ready
    expect(await productDescriptionDraft(deps, S, PRODUCT_ID, 'en', facts())).toEqual({ ok: false, reason: 'NOT_READY' });
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('once Doot\'s own routed connection is ready, makes one real call grounded only on the given attributes, and writes the usage ledger + diary once per press', async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'doot', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "A navy or white cotton pique polo, sizes S to L."}' }], usage: { input_tokens: 300, output_tokens: 70 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await productDescriptionDraft(deps, S, PRODUCT_ID, 'en', facts());
    expect(first).toEqual({ ok: true, body: 'A navy or white cotton pique polo, sizes S to L.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('Cotton pique');
    expect(seenBodies[0]).toContain('Navy, White');

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'Product', refId: PRODUCT_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'mktProductDescription', providerKey: 'anthropic', modelKey: 'claude-sonnet', inputTokens: 300, outputTokens: 70 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBe(1);

    // a second press of the same button is a genuinely new, deliberate ask — its own charge, its own row (unlike
    // support's own per-question idempotency: see product-content-dispatch.ts's own header comment on why).
    await productDescriptionDraft(deps, S, PRODUCT_ID, 'en', facts());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'Product', refId: PRODUCT_ID } })).toBe(2);
    expect(await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } })).toBe(2);
  });

  it('Doot\'s own monthly cap stops a real call before it is made, once this month\'s spend has already crossed it', async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'mktProductDescription', providerKey: 'anthropic', modelKey: 'claude-sonnet', idempotencyKey: 'p-326-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'doot', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await productDescriptionDraft(deps, S, 'p-326-capped', 'en', facts())).toEqual({ ok: false, reason: 'CAP_EXCEEDED' });
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'doot', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON, or with an empty body — is answered as NO_ANSWER, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    expect(await productDescriptionDraft(deps, S, 'p-326-bad-answer', 'en', facts())).toEqual({ ok: false, reason: 'NO_ANSWER' });
  });
});
