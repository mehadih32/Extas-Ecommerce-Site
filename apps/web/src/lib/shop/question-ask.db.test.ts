// S02 · PR 66 follow-up 183 — "Ask a question" on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): off as
// shipped; on: signed-in only as shipped, saved PENDING and never on the product page by itself, the same words twice
// are one, the day's limit, a hidden or archived product refused; anyone: a guest counted by his hashed address; the
// route refuses another site; the "Ask a question" card saved through Products › Reviews › Questions, audited.
// Made-up values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { reviewSettingsHandler } from '../review-settings-api';
import { askHandler, askQuestion } from './question-ask';

const HOST = 'shop.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { cookie?: string; body?: unknown; site?: 'cross-site' } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.83' };
  if (method !== 'GET') headers.origin = opts.site ? 'https://elsewhere.example' : `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Ask a question on PostgreSQL (follow-up 183)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-07T06:00:00Z') };
  const ids: Record<string, string> = {};
  let rafi = { id: '' };
  const set = async (patch: Record<string, unknown>) => {
    const v = await deps.resolver.value('pdp.qaAsk', { storeId: S });
    await deps.resolver.set('pdp.qaAsk', { ...v, ...patch } as never, storeTarget(S), { actorId: null, reason: 'test' });
  };
  const ask = (productId: string, question: unknown, customer: { id: string } | null = rafi, ip = '192.0.2.9') => askQuestion(t.prisma, deps.resolver, { storeId: S, productId, question, customer, ip, now: clock.now });
  const code = async (p: Promise<unknown>) => p.then(() => 'ok').catch((e: { code?: string }) => e.code ?? String(e));

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('question_ask');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const cat = await t.prisma.category.create({ data: { storeId: S, slug: 'ask-polos', nameEn: 'Polos', nameBn: 'পোলো' }, select: { id: true } });
    const mk = async (slug: string, status: 'PUBLISHED' | 'DRAFT') => (await t.prisma.product.create({ data: { storeId: S, slug, nameEn: `Sample ${slug}`, status, categoryId: cat.id }, select: { id: true } })).id;
    ids.polo = await mk('ask-polo', 'PUBLISHED');
    ids.draft = await mk('ask-draft', 'DRAFT');
    rafi = { id: (await t.prisma.customer.create({ data: { storeId: S, name: 'Rafi Ahmed' } })).id };
  });
  afterAll(async () => t?.drop());

  it('as shipped nobody can ask: the box is off', async () => {
    expect((await deps.resolver.value('pdp.qaAsk', { storeId: S })).on).toBe(false);
    expect(await code(ask(ids.polo!, 'Is it cotton?'))).toBe('ASK_OFF');
  });

  it('on: signed-in only; saved waiting and not on the page; the same words twice are one; a draft product refused', async () => {
    await set({ on: true, perDay: 2 });
    expect(await code(ask(ids.polo!, 'Is it cotton?', null))).toBe('SIGNED_OUT');
    expect(await code(ask(ids.draft!, 'Is it cotton?'))).toBe('NOT_FOUND');
    expect(await code(ask(ids.polo!, ' '))).toBe('INVALID_INPUT');
    expect(await code(ask(ids.polo!, 'x'.repeat(301)))).toBe('INVALID_INPUT');
    const first = await ask(ids.polo!, 'Is it cotton?');
    expect(first).toMatchObject({ status: 'PENDING', again: false });
    expect(await ask(ids.polo!, 'Is it cotton?')).toEqual({ id: first.id, status: 'PENDING', again: true });
    const row = await t.prisma.productQuestion.findUniqueOrThrow({ where: { id: first.id } });
    expect(row).toMatchObject({ status: 'PENDING', answer: null, customerId: rafi.id, fromHash: null });
    const shown = await t.prisma.productQuestion.count({ where: { storeId: S, productId: ids.polo, status: 'APPROVED', archivedAt: null, answer: { not: null } } });
    expect(shown).toBe(0);
    await ask(ids.polo!, 'Does it shrink?');
    expect(await code(ask(ids.polo!, 'A third one today'))).toBe('DAY_LIMIT');
  });

  it('anyone: a guest asks, counted by his hashed address only', async () => {
    await set({ who: 'anyone', perDay: 1 });
    const g = await ask(ids.polo!, 'Is there an XXL?', null, '192.0.2.50');
    const row = await t.prisma.productQuestion.findUniqueOrThrow({ where: { id: g.id } });
    expect(row.customerId).toBeNull();
    expect(row.fromHash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.fromHash).not.toContain('192.0.2.50');
    expect(await code(ask(ids.polo!, 'And a 3XL?', null, '192.0.2.50'))).toBe('DAY_LIMIT');
    expect(await code(ask(ids.polo!, 'And a 3XL?', null, '192.0.2.51'))).toBe('ok');
  });

  it('the route refuses another site and a missing database', async () => {
    const d = { db: t.prisma, settings: deps.resolver, storeId: S, customer: async () => null, now: () => clock.now };
    expect((await askHandler(call('POST', '/api/shop/question', { body: { productId: ids.polo, question: 'Hi?' }, site: 'cross-site' }), d)).status).toBe(403);
    expect((await askHandler(call('POST', '/api/shop/question', { body: {} }), null)).status).toBe(503);
    expect((await askHandler(call('POST', '/api/shop/question', { body: { productId: ids.polo, question: 'Washable at 40?' } }), d)).status).toBe(200);
  });

  it('the card on Products › Reviews › Questions saves whole against its version, audited', async () => {
    const got = (await (await reviewSettingsHandler(call('GET', '/api/admin/review-settings', { cookie: owner }), deps)).json()) as { cards: Record<string, { version: string; value: Record<string, unknown> }> };
    const card = got.cards['pdp.qaAsk']!;
    expect(card.value).toMatchObject({ on: true, who: 'anyone' });
    const bad = await reviewSettingsHandler(call('PUT', '/api/admin/review-settings', { cookie: owner, body: { key: 'pdp.qaAsk', version: card.version, value: { ...card.value, perDay: 0 } } }), deps);
    expect(bad.status).toBe(400);
    const ok = await reviewSettingsHandler(call('PUT', '/api/admin/review-settings', { cookie: owner, body: { key: 'pdp.qaAsk', version: card.version, value: { ...card.value, on: false } } }), deps);
    expect(ok.status).toBe(200);
    expect((await deps.resolver.value('pdp.qaAsk', { storeId: S })).on).toBe(false);
    const stale = await reviewSettingsHandler(call('PUT', '/api/admin/review-settings', { cookie: owner, body: { key: 'pdp.qaAsk', version: card.version, value: card.value } }), deps);
    expect(stale.status).toBe(409);
    expect(await t.prisma.auditLog.count({ where: { action: 'pdp.qaAsk.save' } })).toBe(1);
  });
});
