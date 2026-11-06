// S12 · PR 242 — the topic plan on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a cluster with its
// shop page (an outside address refused), the owner's topic approved at once and a writer's proposed (the writer
// cannot approve it), a very close topic held until the second press, "Start writing" making the draft inside the
// cluster (category, writer, focus keyword; the pillar topic becomes the pillar), the links each article lacks, the
// publish refused while `blog.clusters.requireLinks` is on and a link is missing, articles joining and leaving, the
// cluster put away and restored (stale refused); signed out 401. PR 244: the approval queue month by month (the whole
// month approved at once, a very close one held), topics approved by themselves in automatic mode, an article from an
// approved topic published by itself once its last check passes, and the digest of both. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { approveBatch, planHandler, saveTopic, topicAction } from './clusters';
import { journalHandler } from './journal';

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

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Topic plan on PostgreSQL (PR 242)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let writer: Actor;
  let careId = '';
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-06T06:00:00Z') };
  const ctx = { ip: '192.0.2.62', userAgent: 'SampleBrowser/1.0' };
  const api = async (method: string, path: string, h: (r: Request) => Promise<Response>, body?: unknown, cookie = owner) => {
    const r = await h(call(method, path, cookie, body));
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const plan = (kind: 'clusters' | 'topics', method: string, id: string | null, body?: unknown, cookie = owner) => api(method, `/api/admin/blog/${kind}${id ? `/${id}` : ''}`, (r) => planHandler(r, deps, kind, id), body, cookie);
  const posts = (method: string, id: string | null, body?: unknown) => api(method, `/api/admin/blog/posts${id ? `/${id}` : ''}`, (r) => journalHandler(r, deps, id), body);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('clusters');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'pl-writer', nameEn: 'pl-writer', nameBn: 'pl-writer', permissions: ['blog.read', 'blog.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { staffUserId: u.id };
    careId = (await t.prisma.blogCategory.create({ data: { storeId: S, slug: 'care', nameEn: 'Care' } })).id;
  });
  afterAll(async () => t?.drop());

  let clusterId = '';
  let pillarTopic = '';

  it('makes a cluster with its shop page; an outside address is refused; signed out is 401', async () => {
    expect((await plan('clusters', 'GET', null, undefined, '')).status).toBe(401);
    expect((await plan('clusters', 'POST', null, { name: 'Polo care', targetPath: 'https://example.com/x' })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['targetPath'] });
    const made = await plan('clusters', 'POST', null, { name: 'Polo care', nameBn: 'পোলোর যত্ন', categoryId: careId, targetPath: '/collections/polos', keywords: ['polo care'] });
    expect(made.status).toBe(201);
    clusterId = made.j.plan.clusters[0].id;
    expect(made.j.plan.clusters[0]).toMatchObject({ name: 'Polo care', targetPath: '/collections/polos', gaps: 0, archived: false });
    expect(made.j.plan.card.value.requireLinks).toBe(false);
  });

  it('approves the owner’s topic at once, keeps a writer’s proposed until the owner says yes, holds a very close one', async () => {
    const mine = await plan('topics', 'POST', null, { title: 'The complete polo care guide', query: 'polo shirt care', locale: 'en', clusterId, isPillar: true });
    expect(mine.status).toBe(201);
    const tp = mine.j.plan.clusters[0].topics[0];
    expect(tp).toMatchObject({ status: 'approved', isPillar: true, postId: null });
    pillarTopic = tp.id;
    const who = { actor: writer, ctx };
    await saveTopic(t.prisma, deps.resolver, who, null, { title: 'How to stop a polo collar curling', query: 'polo collar curling', locale: 'en', clusterId }, clock.now);
    const row = await t.prisma.blogTopic.findFirstOrThrow({ where: { title: 'How to stop a polo collar curling' } });
    expect(row.status).toBe('proposed');
    expect(await code(topicAction(t.prisma, who, row.id, { action: 'approve', version: row.updatedAt.toISOString() }, clock.now))).toBe('FORBIDDEN');
    const ok = await plan('topics', 'POST', row.id, { action: 'approve', version: row.updatedAt.toISOString() });
    expect(ok.j.plan.counts).toMatchObject({ proposed: 0, approved: 2 });
    // very close to the pillar topic: held, then added on the second press
    const close = await plan('topics', 'POST', null, { title: 'Polo care guide, complete', query: 'polo shirt care', locale: 'en', clusterId });
    expect(close.status).toBe(409);
    expect(close.j).toMatchObject({ error: 'ALIKE', details: ['The complete polo care guide'] });
    const forced = await plan('topics', 'POST', null, { title: 'Polo care guide, complete', query: 'polo shirt care', locale: 'en', clusterId, force: true });
    expect(forced.status).toBe(201);
    const dup = forced.j.plan.clusters[0].topics.find((x: any) => x.title === 'Polo care guide, complete');
    expect(dup.alike).toMatchObject({ level: 'warn', title: 'The complete polo care guide' });
    // turned down, put away, never deleted
    const no = await plan('topics', 'POST', dup.id, { action: 'reject', version: dup.version });
    const dup2 = no.j.plan.clusters[0].topics.find((x: any) => x.id === dup.id);
    expect(dup2.status).toBe('rejected');
    const away = await plan('topics', 'POST', dup.id, { action: 'archive', version: dup2.version });
    expect(away.j.plan.clusters[0].topics.find((x: any) => x.id === dup.id).archived).toBe(true);
    expect(await t.prisma.blogTopic.count()).toBe(3);
  });

  let pillarId = '';
  let supportId = '';

  it('starts writing inside the cluster and lists the links each article lacks', async () => {
    const tp = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: pillarTopic } });
    const started = await plan('topics', 'POST', pillarTopic, { action: 'start', version: tp.updatedAt.toISOString() });
    pillarId = started.j.postId;
    const post = await t.prisma.blogPost.findUniqueOrThrow({ where: { id: pillarId } });
    expect(post).toMatchObject({ status: 'DRAFT', clusterId, categoryId: careId, topicId: pillarTopic, focusKeyword: 'polo shirt care', slug: 'the-complete-polo-care-guide' });
    expect(started.j.plan.clusters[0].pillarPostId).toBe(pillarId);
    expect(started.j.plan.counts.writing).toBe(1);
    const tp2 = await t.prisma.blogTopic.findFirstOrThrow({ where: { title: 'How to stop a polo collar curling' } });
    supportId = (await plan('topics', 'POST', tp2.id, { action: 'start', version: tp2.updatedAt.toISOString() })).j.postId;
    // a started topic cannot be started twice
    const tp3 = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: tp2.id } });
    expect((await plan('topics', 'POST', tp2.id, { action: 'start', version: tp3.updatedAt.toISOString() })).j.error).toBe('WRONG_STATE');
    const now = (await plan('clusters', 'GET', null)).j.plan.clusters[0];
    const support = now.posts.find((x: any) => x.id === supportId);
    expect(support.gaps.map((g: any) => g.kind)).toEqual(['pillar', 'target']);
    expect(now.posts[0].id).toBe(pillarId);
  });

  it('refuses publishing while a required link is missing (rule on), and publishes once the links are in', async () => {
    const get = async (id: string) => (await posts('GET', id)).j.post;
    let s = await get(supportId);
    // the rule is off as it ships: the gap is shown, publishing is not stopped
    const fill = (body: string) => ({ version: s.version, locale: 'en', title: s.title, slug: s.slug, body, categoryId: careId });
    s = (await posts('PUT', supportId, fill('Iron the collar flat.'))).j.post;
    const card = (await plan('clusters', 'GET', null)).j.plan.card;
    expect((await plan('clusters', 'PUT', null, { key: 'clusters', value: { ...card.value, requireLinks: true }, version: card.version })).status).toBe(200);
    // the three review passes are the journal's own (PR 239); here the article is put straight at the last one
    const reviewed = async () => {
      await t.prisma.blogPost.update({ where: { id: supportId }, data: { status: 'SEO_CHECKED' } });
      return get(supportId);
    };
    s = await reviewed();
    const refused = await posts('POST', supportId, { action: 'publish', version: s.version });
    expect(refused.j).toMatchObject({ error: 'LINKS_MISSING', details: ['/journal/the-complete-polo-care-guide', '/collections/polos'] });
    s = (await posts('PUT', supportId, fill('Iron it flat. See [the guide](/journal/the-complete-polo-care-guide) and [our polos](/bn/collections/polos/).'))).j.post;
    s = await reviewed();
    expect((await posts('POST', supportId, { action: 'publish', version: s.version })).j.post.live).toBe(true);
    // the pillar now has to link to the live article too
    const p = (await plan('clusters', 'GET', null)).j.plan.clusters[0].posts.find((x: any) => x.id === pillarId);
    expect(p.gaps.map((g: any) => g.path)).toEqual(['/collections/polos', '/journal/how-to-stop-a-polo-collar-curling']);
    await deps.resolver.set('blog.clusters', { ...card.value, requireLinks: false }, storeTarget(S), { actorId: null, reason: 'test' });
  });

  it('adds and takes out articles, changes the pillar, puts the cluster away and restores it; stale refused', async () => {
    const loose = (await posts('POST', null, { locale: 'en', title: 'Linen in summer', body: 'Light and cool.' })).j.post.id;
    let c = (await plan('clusters', 'GET', null)).j.plan;
    expect(c.loose.map((x: any) => x.id)).toEqual([loose]);
    let cl = c.clusters[0];
    c = (await plan('clusters', 'POST', clusterId, { action: 'add', postId: loose, version: cl.version })).j.plan;
    expect(c.loose).toEqual([]);
    expect((await plan('clusters', 'POST', clusterId, { action: 'remove', postId: loose, version: cl.version })).j.error).toBe('STALE');
    cl = c.clusters[0];
    c = (await plan('clusters', 'POST', clusterId, { action: 'pillar', postId: loose, version: cl.version })).j.plan;
    expect(c.clusters[0].pillarPostId).toBe(loose);
    cl = c.clusters[0];
    c = (await plan('clusters', 'POST', clusterId, { action: 'remove', postId: loose, version: cl.version })).j.plan;
    expect(c.clusters[0].pillarPostId).toBeNull();
    expect(c.loose.map((x: any) => x.id)).toEqual([loose]);
    cl = c.clusters[0];
    c = (await plan('clusters', 'POST', clusterId, { action: 'archive', version: cl.version })).j.plan;
    expect(c.clusters[0].archived).toBe(true);
    expect((await plan('clusters', 'POST', clusterId, { action: 'add', postId: loose, version: c.clusters[0].version })).j.error).toBe('WRONG_STATE');
    c = (await plan('clusters', 'POST', clusterId, { action: 'restore', version: c.clusters[0].version })).j.plan;
    expect(c.clusters[0].archived).toBe(false);
    expect(await t.prisma.contentCluster.count()).toBe(1);
    const audits = await t.prisma.auditLog.count({ where: { action: { startsWith: 'blog.cluster' } } });
    expect(audits).toBeGreaterThanOrEqual(6);
  });

  it('PR 244: queues topics month by month, approves a whole month, approves and publishes by itself in automatic mode', async () => {
    const who = { actor: writer, ctx };
    const add = (title: string, query: string, force = false) => saveTopic(t.prisma, deps.resolver, who, null, { title, query, locale: 'en', clusterId, force }, clock.now);
    await add('Five outfits with a navy polo', 'navy polo outfit');
    await add('Pique or jersey polo for the heat', 'pique vs jersey polo');
    await add('The complete polo care guide again', 'polo shirt care', true);
    let p = (await plan('clusters', 'GET', null)).j.plan;
    const nov = p.queue.find((q: any) => q.month === '2026-11');
    expect(nov.topics.map((x: any) => x.title).sort()).toEqual(['Five outfits with a navy polo', 'Pique or jersey polo for the heat', 'The complete polo care guide again']);
    expect(await code(approveBatch(t.prisma, deps.resolver, who, { month: '2026-11' }, clock.now))).toBe('FORBIDDEN');
    const batch = await api('POST', '/api/admin/blog/topics/batch', (r) => planHandler(r, deps, 'batch', null), { month: '2026-11' });
    expect(batch.j).toMatchObject({ approved: 2, held: 1 });
    expect(batch.j.plan.queue.map((q: any) => q.topics.length)).toEqual([1]);

    // automatic mode: a writer's topic is approved by itself and shows in the digest; a very close one is still held
    const ap = batch.j.plan.approval;
    expect(ap.value).toMatchObject({ mode: 'owner', autoPublish: false });
    expect((await plan('clusters', 'PUT', null, { key: 'approval', value: { ...ap.value, mode: 'auto', autoPublish: true }, version: ap.version })).status).toBe(200);
    await add('Linen shirt care in the monsoon', 'linen shirt care');
    await add('Linen shirt care in monsoon rain', 'linen shirt care', true);
    p = (await plan('clusters', 'GET', null)).j.plan;
    const linen = p.clusters[0].topics.find((x: any) => x.title === 'Linen shirt care in the monsoon');
    expect(linen.status).toBe('approved');
    expect(p.clusters[0].topics.find((x: any) => x.title === 'Linen shirt care in monsoon rain').status).toBe('proposed');
    expect(p.digest.items.map((x: any) => `${x.kind}:${x.title}`)).toEqual(['topic:Linen shirt care in the monsoon']);

    // an article from the approved topic goes live as soon as its last review step passes
    const postId = (await plan('topics', 'POST', linen.id, { action: 'start', version: linen.version })).j.postId;
    let post = (await posts('GET', postId)).j.post;
    post = (await posts('PUT', postId, { version: post.version, locale: 'en', title: post.title, slug: post.slug, body: 'Wash linen cold and dry it in the shade.' })).j.post;
    for (const _ of [1, 2, 3]) post = (await posts('POST', postId, { action: 'pass', version: post.version })).j.post;
    expect(post).toMatchObject({ status: 'PUBLISHED', live: true });
    p = (await plan('clusters', 'GET', null)).j.plan;
    expect(p.digest.items[0]).toMatchObject({ kind: 'post', id: postId, title: 'Linen shirt care in the monsoon' });
    // the owner mode again: the next article waits at its last check
    const ap2 = p.approval;
    await plan('clusters', 'PUT', null, { key: 'approval', value: { ...ap2.value, mode: 'owner' }, version: ap2.version });
  });
});
