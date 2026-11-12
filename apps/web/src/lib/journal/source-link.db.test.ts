// S12 · PR 529 — "Write from a link" end to end on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): off
// while AI is off for the shop, then while the feature itself is off; the settings card needs blog.publish and is
// stale-checked; a disallowed host is refused; a draft lands on the board as DRAFT, AI-assisted, with its source
// kept and wordCount/readingMinutes filled in — through the practice writer when no key is entered and through a
// real writer otherwise; the day's number blocks further drafts; an unreadable page and a writer that does not
// answer each give their own error. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { INSTALLATION, prismaBackend, registry, SettingsResolver, syncSettings, messages } from '@extas/settings';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import type { ArticleWriter } from './briefs';
import { sourceLinkHandler } from './source-link';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.63' };
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

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › Write from a link on PostgreSQL (PR 529)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let looker = '';
  const S = MOTHER_STORE_ID;
  let aiWriter: ArticleWriter | undefined;
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const r = await sourceLinkHandler(call(method, '/api/admin/blog/source-link', cookie, body), deps, aiWriter);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('source_link');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'sl-reader', nameEn: 'sl-reader', nameBn: 'sl-reader', permissions: ['blog.read'] });
    // a real password hash: unlike the direct-actor "writer" fixtures other journal db-tests use, this role is
    // checked over HTTP (through guardAdmin's own permission gate), so it must actually be able to log in.
    const u = await t.prisma.staffUser.create({ data: { email: 'reader@example.com', displayName: 'reader', passwordHash: await hashPassword(OWNER_PW), passwordSetAt: new Date() } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    looker = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'reader@example.com', password: OWNER_PW }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs blog.read to see the screen, 401 signed out; blocked while AI is off, then while the feature is off', async () => {
    expect((await api('GET', undefined, '')).status).toBe(401);
    const off = await api('GET');
    expect(off.j.screen).toMatchObject({ block: 'aiOff', used: 0, dailyMax: 6 });
    await deps.resolver.set('ai.enabled', true, INSTALLATION, { actorId: null, reason: 'test' });
    const stillOff = await api('GET');
    expect(stillOff.j.screen.block).toBe('off');
    expect(stillOff.j.screen.card.value).toEqual({ enabled: false, dailyMax: 6, allowedHosts: [] });
  });

  it('the settings card needs blog.publish, not blog.read; refuses a stale version', async () => {
    const forbidden = await api('PUT', { key: 'sourceWriter', value: { enabled: true, dailyMax: 6, allowedHosts: [] }, version: '2020-01-01T00:00:00.000Z' }, looker);
    expect(forbidden.j.error).toBe('FORBIDDEN');
    const card = (await api('GET')).j.screen.card;
    const stale = await api('PUT', { value: { ...card.value, enabled: true }, version: '2020-01-01T00:00:00.000Z' });
    expect(stale.j.error).toBe('STALE');
    const on = await api('PUT', { value: { enabled: true, dailyMax: 2, allowedHosts: ['example.com'] }, version: card.version });
    expect(on.status).toBe(200);
    expect((await api('GET')).j.screen.block).toBeNull();
  });

  it('refuses a host outside allowedHosts, then a bad url shape', async () => {
    const bad = await api('POST', { url: 'https://other.test/a', locale: 'en' });
    expect([bad.status, bad.j.error, bad.j.details]).toEqual([400, 'HOST_NOT_ALLOWED', ['host:other.test']]);
    const malformed = await api('POST', { url: 'not a url', locale: 'en' });
    expect(malformed.j.error).toBe('HOST_NOT_ALLOWED');
    const noLocale = await api('POST', { url: 'https://example.com/a' });
    expect(noLocale.j.error).toBe('INVALID_INPUT');
  });

  it('reads the link through the page reader mock and writes an original draft, AI-assisted, with its source kept', async () => {
    const made = await api('POST', { url: 'https://example.com/products/linen-shirt-care', locale: 'bn' });
    expect(made.status).toBe(200);
    expect(made.j).toMatchObject({ practice: true });
    const post = await t.prisma.blogPost.findUniqueOrThrow({ where: { id: made.j.postId } });
    expect(post).toMatchObject({ status: 'DRAFT', locale: 'bn', aiAssisted: true, sourceUrls: ['https://example.com/products/linen-shirt-care'] });
    expect(post.title).toBe('Linen Shirt Care');
    expect(post.body!.startsWith('> note: ')).toBe(true);
    expect(post.wordCount).toBeGreaterThan(0);
    expect(post.readingMinutes).toBeGreaterThan(0);
    const log = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'blog.sourceWriter.draft', entityId: post.id } });
    expect(log.after).toMatchObject({ postId: post.id, practice: true, locale: 'bn', sourceUrl: 'https://example.com/products/linen-shirt-care' });
    expect(made.j.screen.used).toBe(1);
  });

  it('a writer that fails gives AI_UNAVAILABLE, never counted against the day; the day’s limit then blocks further drafts', async () => {
    aiWriter = async () => ({ provider: 'fake', mode: 'MOCK', api: { draftArticle: async () => Promise.reject(new Error('down')) } });
    const failed = await api('POST', { url: 'https://example.com/products/second-item', locale: 'en' });
    expect(failed.status).toBe(503);
    expect(await t.prisma.blogPost.count({ where: { sourceUrls: { has: 'https://example.com/products/second-item' } } })).toBe(0);
    aiWriter = undefined;
    const second = await api('POST', { url: 'https://example.com/products/second-item', locale: 'en' });
    expect(second.status).toBe(200);
    expect(second.j.screen.used).toBe(2);
    const blocked = await api('POST', { url: 'https://example.com/products/third-item', locale: 'en' });
    expect([blocked.status, blocked.j.error, blocked.j.details]).toEqual([409, 'DAILY_LIMIT', ['2']]);
    expect((await api('GET')).j.screen.block).toBe('limit');
  });
});
