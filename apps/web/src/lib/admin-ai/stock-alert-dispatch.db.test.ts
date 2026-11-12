// S15 · PR 333 — the ninth real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `stockAlertNote`/`stockAlertOption` are called straight,
// exactly the way `apps/web/src/app/admin/stock/page.tsx` calls `stockAlertOption` for each open low-stock alert.
// No real network call: the global `fetch` is replaced for the tests that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';
import { stockAlertNote, stockAlertOption, type StockAlertAiDeps, type StockAlertFacts } from './stock-alert-dispatch';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const OWNER = SYSTEM;
const ALERT_ID = 'alert-333-sample';

const facts = (over: Partial<StockAlertFacts> = {}): StockAlertFacts => ({
  productName: 'Sample Pique Polo',
  sku: 'SPP-NVY-M',
  colour: 'Navy',
  size: 'M',
  available: 2,
  threshold: 5,
  since: '2026-11-09T10:00:00Z', // 3 whole days before NOW
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the low-stock alert reports job dispatcher on PostgreSQL (PR 333)', () => {
  let t: TestDatabase;
  let deps: StockAlertAiDeps;
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
    expect(await stockAlertNote(deps, S, ALERT_ID, 'en', facts())).toBeNull();

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'gyani', true);
    // on, but no AI_PROVIDER connection is ready yet — still honestly null
    expect(await stockAlertNote(deps, S, ALERT_ID, 'en', facts())).toBeNull();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('answers null without even checking anything, when the alert has no product name or SKU to ground a line on', async () => {
    expect(await stockAlertNote(deps, S, ALERT_ID, 'en', facts({ productName: ' ' }))).toBeNull();
    expect(await stockAlertNote(deps, S, ALERT_ID, 'en', facts({ sku: ' ' }))).toBeNull();
  });

  it("once gyani's own routed connection is ready, makes one real call and writes the usage ledger + diary once — idempotently, never a reorder decision", async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'gyani', 'anthropic');

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Only 2 left against a threshold of 5, and it has sat low for 3 days."}' }], usage: { input_tokens: 45, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const note = await stockAlertNote(deps, S, ALERT_ID, 'en', facts());
    expect(note).toBe('Only 2 left against a threshold of 5, and it has sat low for 3 days.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('SPP-NVY-M'); // the alert's own already-computed numbers reached the provider
    expect(seenBodies[0]).toContain('daysLow: 3'); // the day count is computed here, never left to the model's own arithmetic
    for (const word of ['reorder', 'supplier', 'how many to buy']) expect(seenBodies[0]!.toLowerCase()).not.toContain(`decide the ${word}`); // the prompt never hands the model a reorder decision to echo

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'LowStockAlert', refId: ALERT_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'reportsStockAlert', providerKey: 'anthropic' });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBeGreaterThanOrEqual(1);

    // the same alert's own still-unchanged numbers, asked again (a repeat page view): one real call, but no second charge
    const again = await stockAlertNote(deps, S, ALERT_ID, 'en', facts());
    expect(again).toBe('Only 2 left against a threshold of 5, and it has sat low for 3 days.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'LowStockAlert', refId: ALERT_ID } })).toBe(1);

    // a genuinely different available count (stock moved) gets its own row
    await stockAlertNote(deps, S, ALERT_ID, 'en', facts({ available: 1 }));
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'LowStockAlert', refId: ALERT_ID } })).toBe(2);
  });

  it("the agent's own monthly cap stops a real call before it is made, once this month's spend has already crossed it", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'gyani' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, jobTypeKey: 'reportsStockAlert', providerKey: 'anthropic', modelKey: 'gemini-flash', idempotencyKey: 'alert-333-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await stockAlertNote(deps, S, 'alert-333-capped', 'en', facts())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'gyani', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON — is swallowed, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    await expect(stockAlertNote(deps, S, 'alert-333-bad-answer', 'en', facts())).resolves.toBeNull();
  });

  it('stockAlertOption threads the given facts straight through, with no second lookup of its own', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Worth a look."}' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const option = stockAlertOption(deps, S, 'alert-333-option', 'en');
    expect(await option(facts({ available: 0 }))).toBe('Worth a look.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
