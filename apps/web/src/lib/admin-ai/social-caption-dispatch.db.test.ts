// S15 · PR 331 — the seventh real AI-provider job dispatcher, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`). `socialReelCaptionDraft` is called straight, the way
// the studio AI-caption API route (PR 331's own "Draft a caption with AI" button) calls it — never on a plain page
// view. No real network call: the global `fetch` is replaced for the one test that reaches a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { setAgentMonthlyCap } from './spend-cap';
import { socialReelCaptionDraft, type SocialCaptionAiDeps, type SocialCaptionFacts } from './social-caption-dispatch';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
// Found while investigating a real CI "db" job failure on this stack's own commit 45f45287 — see
// `support-dispatch.db.test.ts`'s own comment on this same line for the full explanation: `SYSTEM`
// (`{ staffUserId: null }`, `@extas/auth`) is the real system actor `resolver.ts` accepts, never a bare string.
const OWNER = SYSTEM;
const TEMPLATE_ID = 't-331-sample';

const facts = (over: Partial<SocialCaptionFacts> = {}): SocialCaptionFacts => ({
  templateName: 'Reel — new arrivals',
  notes: 'Upbeat, fast cuts',
  ...over,
});

describe.skipIf(!HAS_TEST_DB)('AI 360 · the social content job dispatcher on PostgreSQL (PR 331)', () => {
  let t: TestDatabase;
  let deps: SocialCaptionAiDeps;
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

  it('answers FEATURE_OFF while `studio.ai.captions` is still off (its ships-default), even once AI 360 and Doot are both on', async () => {
    expect(await socialReelCaptionDraft(deps, S, TEMPLATE_ID, 'en', facts())).toEqual({ ok: false, reason: 'FEATURE_OFF' });

    await setMasterEnabled({ resolver }, { actor: OWNER }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: OWNER }, 'doot', true);
    // the feature's own switch is still off — AI 360 and Doot being on is not enough on its own
    expect(await socialReelCaptionDraft(deps, S, TEMPLATE_ID, 'en', facts())).toEqual({ ok: false, reason: 'FEATURE_OFF' });
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('once `studio.ai.captions` is on, still answers honestly while no connection is ready for the routed data class', async () => {
    await resolver.set('studio.ai.captions', true, storeTarget(S), { actorId: null, reason: 'test' });
    expect(await socialReelCaptionDraft(deps, S, TEMPLATE_ID, 'en', facts())).toEqual({ ok: false, reason: 'NOT_READY' });
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('once Doot\'s own routed connection is ready, makes one real call grounded only on the template\'s own name/notes and the store\'s own voice tone, and writes the usage ledger + diary once per press', async () => {
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: OWNER }, 'doot', 'anthropic');
    await resolver.set('studio.voice', { toneEn: 'Playful, upbeat', hashtagSet: [], blockedWords: [] }, storeTarget(S), { actorId: null, reason: 'test' });

    const seenBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      seenBodies.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "New arrivals just dropped — swipe to see every colour."}' }], usage: { input_tokens: 90, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await socialReelCaptionDraft(deps, S, TEMPLATE_ID, 'en', facts());
    expect(first).toEqual({ ok: true, body: 'New arrivals just dropped — swipe to see every colour.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seenBodies[0]).toContain('Reel — new arrivals');
    expect(seenBodies[0]).toContain('Upbeat, fast cuts');
    expect(seenBodies[0]).toContain('Playful, upbeat');

    const rows = await t.prisma.aiUsageLedger.findMany({ where: { refType: 'StudioTemplate', refId: TEMPLATE_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ jobTypeKey: 'socialReelCaption', providerKey: 'anthropic', modelKey: 'claude-haiku', inputTokens: 90, outputTokens: 20 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    expect(rows[0]!.agentId).toBe(agent.id);
    const diaryCount = await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } });
    expect(diaryCount).toBe(1);

    // a second press of the same button is a genuinely new, deliberate ask — its own charge, its own row (the same
    // "no repeat page view to dedupe against" convention `product-content-dispatch.ts`'s own header comment uses).
    await socialReelCaptionDraft(deps, S, TEMPLATE_ID, 'en', facts());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'StudioTemplate', refId: TEMPLATE_ID } })).toBe(2);
    expect(await t.prisma.aiDiaryEntry.count({ where: { agentId: agent.id } })).toBe(2);
  });

  it('never hands back a caption that uses one of the store\'s own blocked words, though the real call is still charged (the cost is real either way)', async () => {
    await resolver.set('studio.voice', { toneEn: '', hashtagSet: [], blockedWords: ['sale'] }, storeTarget(S), { actorId: null, reason: 'test' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Huge sale — grab it before it\'s gone!"}' }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const before = await t.prisma.aiUsageLedger.count();
    expect(await socialReelCaptionDraft(deps, S, 't-331-blocked', 'en', facts())).toEqual({ ok: false, reason: 'BLOCKED_WORD' });
    expect(await t.prisma.aiUsageLedger.count()).toBe(before + 1);
    await resolver.set('studio.voice', { toneEn: '', hashtagSet: [], blockedWords: [] }, storeTarget(S), { actorId: null, reason: 'test' }); // back off for later tests
  });

  it('Doot\'s own monthly cap stops a real call before it is made, once this month\'s spend has already crossed it', async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    await t.prisma.aiUsageLedger.create({
      data: { storeId: S, agentId: agent.id, createdAt: NOW, jobTypeKey: 'socialReelCaption', providerKey: 'anthropic', modelKey: 'claude-sonnet', idempotencyKey: 't-331-already-spent', inputTokens: 0, outputTokens: 0, costUsdMicros: 1_000_000n, costMinor: 1000 },
    });
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'doot', 1); // any cap at all — 1000 already spent this month is already over it
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await socialReelCaptionDraft(deps, S, 't-331-capped', 'en', facts())).toEqual({ ok: false, reason: 'CAP_EXCEEDED' });
    expect(fetchMock).not.toHaveBeenCalled();
    await setAgentMonthlyCap(deps, { actor: OWNER }, 'doot', null); // back off, for any test that runs after this one
  });

  it('any failure of the call itself — the provider refuses, answers with no JSON, or with an empty body — is answered as NO_ANSWER, never thrown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    expect(await socialReelCaptionDraft(deps, S, 't-331-bad-answer', 'en', facts())).toEqual({ ok: false, reason: 'NO_ANSWER' });
  });
});
