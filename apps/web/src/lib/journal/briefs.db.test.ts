// S12 · PR 528 — the brief form on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a new brief starts
// from the setting's word count and the topic's language and phrase; the four musts (topic, language, words in range,
// a keyword) refused when missing; one brief per topic; a brief typed with a new title makes the topic by the plan's
// rules (a writer's waits for the owner); stale refused; "Start writing" takes the brief's language and keyword and
// the brief points at the article; with `blog.brief.requireForStart` on a topic without a brief is refused; the card
// needs `blog.publish`; signed out 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { briefHandler, saveBrief } from './briefs';
import { planHandler } from './clusters';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.62' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Brief on PostgreSQL (PR 528)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let writer: Actor;
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-06T06:00:00Z') };
  const ctx = { ip: '192.0.2.62', userAgent: 'SampleBrowser/1.0' };
  const api = async (method: string, path: string, h: (r: Request) => Promise<Response>, body?: unknown, cookie = owner) => {
    const r = await h(call(method, path, cookie, body));
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const briefs = (method: string, id: string | null, body?: unknown, q = '', cookie = owner) => api(method, `/api/admin/blog/briefs${id ? `/${id}` : ''}${q}`, (r) => briefHandler(r, deps, id), body, cookie);
  const topics = (method: string, id: string | null, body?: unknown) => api(method, `/api/admin/blog/topics${id ? `/${id}` : ''}`, (r) => planHandler(r, deps, 'topics', id), body);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('briefs');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'br-writer', nameEn: 'br-writer', nameBn: 'br-writer', permissions: ['blog.read', 'blog.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { staffUserId: u.id };
  });
  afterAll(async () => t?.drop());

  let topicId = '';
  let briefId = '';

  it('starts a new brief from the setting and the topic; refuses a brief missing one of the four musts', async () => {
    expect((await briefs('GET', null, undefined, '', '')).status).toBe(401);
    const tp = await topics('POST', null, { title: 'Why polo collars curl', query: 'polo collar curling', locale: 'en' });
    topicId = tp.j.plan.topics[0].id;
    const fresh = await briefs('GET', null, undefined, `?topic=${topicId}`);
    expect(fresh.j.screen.brief).toMatchObject({ id: null, topicId, language: 'en', wordCount: 900, keywords: ['polo collar curling'], intent: 'info', imagePolicy: 'own' });
    expect(fresh.j.screen.topics.map((x: any) => x.id)).toContain(topicId);
    const must = { topicId, language: 'bn', wordCount: 900, keywords: 'polo collar' };
    for (const [k, v] of [['wordCount', 299], ['keywords', ''], ['language', 'xx']] as const) {
      const bad = await briefs('POST', null, { ...must, [k]: v });
      expect(bad.j, k).toMatchObject({ error: 'INVALID_INPUT', details: [k] });
    }
    const made = await briefs('POST', null, { ...must, query: 'polo collar curling', outline: 'Why it curls\nHow to stop it', links: '/collections/polos', shotList: 'A curled collar, close' });
    expect(made.status).toBe(201);
    briefId = made.j.id;
    expect(made.j.screen.brief).toMatchObject({ topicId, topicTitle: 'Why polo collars curl', language: 'bn', outline: ['Why it curls', 'How to stop it'], links: ['/collections/polos'], gaps: [] });
    expect((await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: topicId } })).locale).toBe('bn');
    // one brief per topic
    expect((await briefs('POST', null, must)).j).toMatchObject({ error: 'BRIEF_TAKEN', details: [briefId] });
    expect((await briefs('GET', null)).j.screen.topics.map((x: any) => x.id)).not.toContain(topicId);
    // stale
    expect((await briefs('PUT', briefId, { ...must, version: '2020-01-01T00:00:00.000Z' })).j.error).toBe('STALE');
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'blog.brief.create', entityId: briefId } });
    expect(audit).not.toBeNull();
  });

  it('makes the topic from a brief typed with a new title, by the plan’s rules', async () => {
    const who = { actor: writer, ctx };
    const id = await saveBrief(t.prisma, deps.resolver, who, null, { title: 'Linen or cotton for Dhaka summers', language: 'en', wordCount: 1200, keywords: ['linen vs cotton'] }, clock.now);
    const b = await t.prisma.blogBrief.findUniqueOrThrow({ where: { id } });
    const tp = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: b.topicId! } });
    expect(tp).toMatchObject({ title: 'Linen or cotton for Dhaka summers', status: 'proposed', locale: 'en' });
  });

  it('"Start writing" takes the brief’s language and keyword; with the switch on a topic without a brief waits', async () => {
    const row = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: topicId } });
    const started = await topics('POST', topicId, { action: 'start', version: row.updatedAt.toISOString() });
    expect(started.status).toBe(200);
    const post = await t.prisma.blogPost.findUniqueOrThrow({ where: { id: started.j.postId } });
    expect(post).toMatchObject({ locale: 'bn', focusKeyword: 'polo collar curling', topicId });
    expect((await t.prisma.blogBrief.findUniqueOrThrow({ where: { id: briefId } })).postId).toBe(post.id);
    expect(started.j.plan.topics.find((x: any) => x.id === topicId).briefId).toBe(briefId);

    // the card: the owner turns the rule on
    const card = (await briefs('GET', null)).j.screen.card;
    expect(card.value.requireForStart).toBe(false);
    const on = await briefs('PUT', null, { key: 'brief', value: { ...card.value, requireForStart: true }, version: card.version });
    expect(on.status).toBe(200);
    expect(on.j.cards.brief.value.requireForStart).toBe(true);
    const bare = await topics('POST', null, { title: 'Ironing a polo the right way', query: 'iron polo', locale: 'en' });
    const bareId = bare.j.plan.topics.find((x: any) => x.title === 'Ironing a polo the right way').id;
    const r = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: bareId } });
    expect((await topics('POST', bareId, { action: 'start', version: r.updatedAt.toISOString() })).j.error).toBe('BRIEF_MISSING');
  });
});
