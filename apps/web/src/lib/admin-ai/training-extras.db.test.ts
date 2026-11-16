// PR 719 — the Training extras write paths and the "Try it" sandbox on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL, like every
// other `.db.test.ts`). `changeExtras` and `tryIt` are called straight, the way `training-extras-api.ts` calls them. No real network call:
// the global `fetch` is replaced for the tests that reach a live provider.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings, TRAINING_DOCS_MAX } from '@extas/settings';
import { ensureAgentRows, setAgentEnabled, setMasterEnabled } from './control-room';
import { setAgentModelProvider } from './model-picks';
import { changeExtras, extrasState, SANDBOX_REF_TYPE, sandboxAgentKey, tryIt, type ExtrasDeps } from './training-extras';

const S = MOTHER_STORE_ID;
const NOW = new Date('2026-11-12T10:00:00Z');
const who = { actor: SYSTEM };
const name = (k: string) => k;

describe.skipIf(!HAS_TEST_DB)('AI Center · Training extras on PostgreSQL (PR 719)', () => {
  let t: TestDatabase;
  let deps: ExtrasDeps;
  let resolver: SettingsResolver<typeof registry>;
  const rows = (kind: string) => t.prisma.aiTrainingExample.findMany({ where: { kind }, orderBy: { createdAt: 'asc' } });

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

  it('saves a correction as a sandbox example for one agent only, and audits it', async () => {
    await changeExtras(deps, who, { action: 'saveExample', agent: 'doot', sample: 'Where is my parcel?', better: 'Share the tracking link first.' });
    const [row] = await rows('correction');
    expect(row).toMatchObject({ agentKey: 'doot', input: 'Where is my parcel?', expected: 'Share the tracking link first.', sourceRef: 'sandbox', archivedAt: null });
    expect((await extrasState(t.prisma)).examples).toHaveLength(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.training.correction', entityId: row!.id } })).toBe(1);
    await expect(changeExtras(deps, who, { action: 'saveExample', agent: 'all', sample: 'x', better: 'y' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(changeExtras(deps, who, { action: 'saveExample', agent: 'doot', sample: 'x', better: ' ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('adds a document, refuses a duplicate title for the same agent, versions an edit and archives on remove (nothing is deleted)', async () => {
    await changeExtras(deps, who, { action: 'addDoc', agent: 'all', title: 'Returns', text: 'Seven days.' });
    await expect(changeExtras(deps, who, { action: 'addDoc', agent: 'all', title: 'Returns', text: 'Other.' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    const first = (await extrasState(t.prisma)).docs.find((d) => d.title === 'Returns')!;
    expect(first.version).toBe(1);

    await expect(changeExtras(deps, who, { action: 'editDoc', id: first.id, text: 'Seven days.' })).rejects.toMatchObject({ code: 'NO_CHANGE' });
    await changeExtras(deps, who, { action: 'editDoc', id: first.id, text: 'Ten days.' });
    const live = (await extrasState(t.prisma)).docs.filter((d) => d.title === 'Returns');
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ text: 'Ten days.', version: 2 });
    expect((await t.prisma.aiTrainingExample.findUniqueOrThrow({ where: { id: first.id } })).archivedAt).not.toBeNull();

    await changeExtras(deps, who, { action: 'removeDoc', id: live[0]!.id });
    expect((await extrasState(t.prisma)).docs.filter((d) => d.title === 'Returns')).toHaveLength(0);
    expect((await rows('document')).length).toBe(2); // both versions are still there, archived
    await expect(changeExtras(deps, who, { action: 'removeDoc', id: live[0]!.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.training.archive' } })).toBe(2);
  });

  it('stops adding documents at the limit', async () => {
    const active = (await extrasState(t.prisma)).docs.length;
    for (let i = active; i < TRAINING_DOCS_MAX; i++) await changeExtras(deps, who, { action: 'addDoc', agent: 'all', title: `Filler ${i}`, text: 'x' });
    await expect(changeExtras(deps, who, { action: 'addDoc', agent: 'all', title: 'One too many', text: 'x' })).rejects.toMatchObject({ code: 'FULL' });
    for (const d of (await extrasState(t.prisma)).docs) await changeExtras(deps, who, { action: 'removeDoc', id: d.id });
  });

  it('saves a "describe a problem" note for an agent and lists it', async () => {
    await changeExtras(deps, who, { action: 'addNote', agent: 'doot', text: 'It sounds too pushy in the evening.' });
    const [n] = await rows('note');
    expect(n).toMatchObject({ agentKey: 'doot', input: 'It sounds too pushy in the evening.', sourceRef: 'problem' });
    expect((await extrasState(t.prisma)).notes.map((x) => x.text)).toEqual(['It sounds too pushy in the evening.']);
    await expect(changeExtras(deps, who, { action: 'addNote', agent: 'doot', text: '   ' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(changeExtras(deps, who, { action: 'addNote', agent: 'nobody', text: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(changeExtras(deps, who, { action: 'nope' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('sandbox: AI off means no model call and no ledger row', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await tryIt(deps, { agent: 'doot', sample: 'Hello' }, name, 'en')).toEqual({ status: 'off' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.prisma.aiUsageLedger.count()).toBe(0);
  });

  it('sandbox: answers as the chosen agent and bills that agent, marked as a sandbox test (never prohori)', async () => {
    await setMasterEnabled({ resolver }, { actor: SYSTEM }, true, S);
    await setAgentEnabled({ db: t.prisma }, { actor: SYSTEM }, 'doot', true);
    await setAgentEnabled({ db: t.prisma }, { actor: SYSTEM }, 'prohori', true);
    await t.prisma.integration.create({ data: { storeId: null, kind: 'AI_PROVIDER', provider: 'anthropic', name: 'anthropic', mode: 'LIVE', enabled: true, config: { model: 'claude-sonnet-5' }, secretNames: ['apiKey'] } });
    await setAgentModelProvider(deps, { actor: SYSTEM }, 'doot', 'anthropic');
    await changeExtras(deps, who, { action: 'addNote', agent: 'doot', text: 'ignored by the sandbox' });
    await changeExtras(deps, who, { action: 'addDoc', agent: 'doot', title: 'Tone', text: 'Always greet warmly.' });

    const seen: string[] = [];
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      seen.push(JSON.parse(init.body as string).messages[0].content as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"body": "Hello, welcome!"}' }], usage: { input_tokens: 90, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await tryIt(deps, { agent: 'doot', sample: 'Hi there' }, name, 'en');
    expect(r).toEqual({ status: 'ok', answer: 'Hello, welcome!' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen[0]).toContain('Always greet warmly.'); // the agent's own document reached the model

    const doot = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'doot' } });
    const prohori = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: 'prohori' } });
    const ledger = await t.prisma.aiUsageLedger.findMany({ where: { refType: SANDBOX_REF_TYPE } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ agentId: doot.id, refId: 'training:doot' });
    expect(await t.prisma.aiUsageLedger.count({ where: { agentId: prohori.id } })).toBe(0);
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: 'AdminGuidePage' } })).toBe(0);
    const diary = await t.prisma.aiDiaryEntry.findMany({ where: { agentId: doot.id, refType: SANDBOX_REF_TYPE } });
    expect(diary).toHaveLength(1);

    // the same sample against unchanged instructions: no second charge
    await tryIt(deps, { agent: 'doot', sample: 'Hi there' }, name, 'en');
    expect(await t.prisma.aiUsageLedger.count({ where: { refType: SANDBOX_REF_TYPE } })).toBe(1);
  });

  it('sandbox: a paused agent gets no model call (unavailable), even with the master switch on', async () => {
    await setAgentEnabled({ db: t.prisma }, { actor: SYSTEM }, 'doot', false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await tryIt(deps, { agent: 'doot', sample: 'A brand new question' }, name, 'en')).toEqual({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sandbox: "all agents" is billed to the agent named in the request, never a fixed one', () => {
    expect(sandboxAgentKey('all')).toBeNull();
    expect(sandboxAgentKey('all', 'doot')).toBe('doot');
    expect(sandboxAgentKey('doot')).toBe('doot');
  });
});
