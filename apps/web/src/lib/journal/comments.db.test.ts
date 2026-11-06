// S12 · PR 251 — readers' comments on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): off as shipped (the
// journal without comments); on: signed-in only, saved waiting and never shown by itself, the same words twice are one,
// the day's limit, a draft refused, a guest only with a name when anyone may write; the Comments page: Show, Undo
// (back), Hide, the card saved as the switch card sends it, audited; another site 403, signed out 401. Made-up values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { commentsHandler, commentsScreen, postComment, shopCommentHandler, shownComments } from './comments';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { cookie?: string; body?: unknown; site?: 'cross-site' } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.71' };
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

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Comments on PostgreSQL (PR 251)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-06T06:00:00Z') };
  const ids: Record<string, string> = {};
  let rafi = { id: '', name: 'Rafi Ahmed' as string | null };
  const set = async (patch: Record<string, unknown>) => {
    const v = await deps.resolver.value('blog.comments', { storeId: S });
    await deps.resolver.set('blog.comments', { ...v, ...patch } as never, storeTarget(S), { actorId: null, reason: 'test' });
  };
  const send = (postId: string, body: unknown, customer: typeof rafi | null = rafi, name?: string) => postComment(t.prisma, deps.resolver, { storeId: S, postId, body, name, customer, ip: '192.0.2.9', now: clock.now });
  const code = async (p: Promise<unknown>) => p.then(() => 'ok').catch((e: { code?: string }) => e.code ?? String(e));

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('comments');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const mk = async (slug: string, status: 'PUBLISHED' | 'DRAFT') =>
      (await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug, title: `Sample ${slug}`, body: 'Sample words.', status, publishedAt: status === 'PUBLISHED' ? new Date('2026-11-01T00:00:00Z') : null } })).id;
    ids.wash = await mk('how-to-wash', 'PUBLISHED');
    ids.draft = await mk('draft-one', 'DRAFT');
    rafi = { id: (await t.prisma.customer.create({ data: { storeId: S, name: 'Rafi Ahmed' } })).id, name: 'Rafi Ahmed' };
  });
  afterAll(async () => t?.drop());

  it('as shipped the journal runs without comments: a comment is refused', async () => {
    expect((await deps.resolver.value('blog.comments', { storeId: S })).on).toBe(false);
    expect(await code(send(ids.wash!, 'Nice tip'))).toBe('COMMENTS_OFF');
  });

  it('on: signed-in only; saved waiting, never shown by itself; the same words twice are one; a draft refused', async () => {
    await set({ on: true });
    expect(await code(send(ids.wash!, 'Nice tip', null, 'Guest'))).toBe('SIGNED_OUT');
    const a = await send(ids.wash!, '  Washed it cold, worked!  ');
    expect(a).toMatchObject({ status: 'PENDING', again: false });
    expect(await send(ids.wash!, 'Washed it cold, worked!')).toMatchObject({ id: a.id, again: true });
    expect(await shownComments(t.prisma, S, ids.wash!, 20)).toEqual([]);
    expect(await code(send(ids.draft!, 'On a draft'))).toBe('NOT_FOUND');
    expect(await code(send(ids.wash!, 'x'))).toBe('INVALID_INPUT');
    const row = await t.prisma.blogComment.findUniqueOrThrow({ where: { id: a.id } });
    expect(row).toMatchObject({ status: 'PENDING', customerId: rafi.id, name: 'Rafi Ahmed', body: 'Washed it cold, worked!', fromHash: null });
  });

  it('keeps the day limit; a guest may write with a name only when anyone may', async () => {
    await set({ perDay: 2 });
    await send(ids.wash!, 'Second one');
    expect(await code(send(ids.wash!, 'Third one'))).toBe('DAY_LIMIT');
    await set({ who: 'anyone' });
    expect(await code(send(ids.wash!, 'From a guest', null))).toBe('INVALID_INPUT');
    const g = await send(ids.wash!, 'From a guest', null, '  Mina  ');
    const row = await t.prisma.blogComment.findUniqueOrThrow({ where: { id: g.id } });
    expect(row.name).toBe('Mina');
    expect(row.fromHash).toMatch(/^[0-9a-f]{32}$/);
    await set({ who: 'signedIn', perDay: 3 });
  });

  it('the shop answer: another site 403; a comment 200 waiting', async () => {
    const shopDeps = { db: t.prisma, settings: deps.resolver, storeId: S, customer: async () => rafi, now: () => clock.now };
    expect((await shopCommentHandler(call('POST', '/api/shop/journal-comment', { body: { postId: ids.wash, body: 'Hi' }, site: 'cross-site' }), shopDeps)).status).toBe(403);
    const r = await shopCommentHandler(call('POST', '/api/shop/journal-comment', { body: { postId: ids.wash, body: 'Does it fade?' } }), shopDeps);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, status: 'PENDING' });
    const off = await shopCommentHandler(call('POST', '/api/shop/journal-comment', { body: { postId: ids.wash, body: 'Does it fade?' } }), { ...shopDeps, customer: async () => null });
    expect(off.status).toBe(401);
  });

  it('the Comments page: Show, Undo puts it back, Hide — each audited; shown under the article only after Show', async () => {
    expect((await commentsHandler(call('GET', '/api/admin/blog/comments'), deps)).status).toBe(401);
    const screen = await commentsScreen(t.prisma, deps.resolver, clock.now);
    expect(screen.counts).toEqual({ waiting: 4, shown: 0, hidden: 0 });
    expect(screen.rows[0]!.post).toMatchObject({ slug: 'how-to-wash', live: true });
    const first = screen.rows.find((r) => r.body === 'Washed it cold, worked!')!;
    const move = (to: string, list = [first.id]) => commentsHandler(call('POST', '/api/admin/blog/comments', { cookie: owner, body: { ids: list, to } }), deps);
    const shown = await move('APPROVED');
    expect(shown.status).toBe(200);
    expect((await shown.json()).screen.counts).toEqual({ waiting: 3, shown: 1, hidden: 0 });
    expect((await shownComments(t.prisma, S, ids.wash!, 20)).map((c) => c.body)).toEqual(['Washed it cold, worked!']);
    expect((await (await move('back')).json()).screen.counts).toEqual({ waiting: 4, shown: 0, hidden: 0 });
    await move('APPROVED');
    expect((await (await move('HIDDEN')).json()).screen.counts).toEqual({ waiting: 3, shown: 0, hidden: 1 });
    expect(await shownComments(t.prisma, S, ids.wash!, 20)).toEqual([]);
    expect((await move('nonsense')).status).toBe(400);
    expect((await move('APPROVED', ['00000000-0000-7000-8000-000000000000'])).status).toBe(404);
    const audits = await t.prisma.auditLog.findMany({ where: { entityType: 'BlogComment', entityId: first.id }, orderBy: { createdAt: 'asc' }, select: { action: true } });
    expect(audits.map((a) => a.action)).toEqual(['blog.comment.approved', 'blog.comment.pending', 'blog.comment.approved', 'blog.comment.hidden']);
    expect(await t.prisma.blogComment.count({ where: { storeId: S } })).toBe(4);
  });

  it('the card: saved as the switch card sends it, bounded, audited; another site refused', async () => {
    const put = (b: unknown, site?: 'cross-site') => commentsHandler(call('PUT', '/api/admin/blog/comments', { cookie: owner, body: b, ...(site ? { site } : {}) }), deps);
    expect((await put({ key: 'blog.comments', on: false, values: {} }, 'cross-site')).status).toBe(403);
    const r = await put({ key: 'blog.comments', on: false, values: { maxChars: 400 } });
    expect(r.status).toBe(200);
    expect((await r.json()).screen.card.value).toMatchObject({ on: false, maxChars: 400 });
    expect((await put({ key: 'blog.comments', on: true, values: { maxChars: 5 } })).status).toBe(400);
    expect((await put({ value: { on: true }, version: 'old' })).status).toBe(409);
    expect(await t.prisma.auditLog.count({ where: { action: 'blog.comments.settings' } })).toBe(1);
  });
});
