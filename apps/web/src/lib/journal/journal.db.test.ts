// S12 · PR 239 — the journal on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): categories two levels deep
// and authors (put away, never deleted), an article made and saved at its version (stale refused, a link taken twice
// refused, another store's product refused), the three review passes with their history, the writer refused on his own
// article while `reviewByAnother` is on, a writer without `blog.publish` refused publishing, an edit under review sent
// back to writing, scheduling and the shop's read (live once its time comes, only its language), take down and put
// away; signed out 401. PR 249: an article's live twin either way, "Read next" (its plan first, then its topic, never
// itself, another language or a post not live) and the sitemap's live articles. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { journalAction, journalHandler, liveJournal, livePost, liveRelated, liveSitemapPosts, liveTwinSlug, saveJournalPost, shelfHandler, switchTarget } from './journal';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.61' };
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

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal on PostgreSQL (PR 239)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let writer: Actor;
  let editor: Actor;
  let productId = '';
  let otherStoreProduct = '';
  const S = MOTHER_STORE_ID;
  const clock = { now: new Date('2026-11-06T06:00:00Z') };
  const ctx = { ip: '192.0.2.61', userAgent: 'SampleBrowser/1.0' };
  const api = async (method: string, path: string, h: (r: Request) => Promise<Response>, body?: unknown, cookie = owner) => {
    const r = await h(call(method, path, cookie, body));
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const posts = (method: string, id: string | null, body?: unknown, cookie = owner) => api(method, `/api/admin/blog/posts${id ? `/${id}` : ''}`, (r) => journalHandler(r, deps, id), body, cookie);
  const shelf = (kind: 'categories' | 'authors', method: string, id: string | null, body?: unknown) => api(method, `/api/admin/blog/${kind}${id ? `/${id}` : ''}`, (r) => shelfHandler(r, deps, kind, id), body);

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('journal');
    const [A, B] = await seedSampleStores(t.prisma);
    expect(A).toBe(S);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => clock.now };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: OWNER_PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'jr-writer', nameEn: 'jr-writer', nameBn: 'jr-writer', permissions: ['blog.read', 'blog.write'] });
    const mk = async (email: string) => {
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email.split('@')[0]!, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { staffUserId: u.id };
    };
    writer = await mk('writer@example.com');
    editor = await mk('editor@example.com');
    const g = await t.prisma.garmentType.create({ data: { storeId: S, key: 'jr-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = await t.prisma.category.create({ data: { storeId: S, slug: 'jr-polos', nameEn: 'Polos', isVisible: true, garmentTypeId: g.id } });
    productId = (await t.prisma.product.create({ data: { storeId: S, slug: 'jr-polo', nameEn: 'Sample polo', status: 'PUBLISHED', categoryId: cat.id } })).id;
    const g2 = await t.prisma.garmentType.create({ data: { storeId: B!, key: 'jr-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat2 = await t.prisma.category.create({ data: { storeId: B!, slug: 'jr-polos', nameEn: 'Polos', isVisible: true, garmentTypeId: g2.id } });
    otherStoreProduct = (await t.prisma.product.create({ data: { storeId: B!, slug: 'jr-polo', nameEn: 'Other polo', status: 'PUBLISHED', categoryId: cat2.id } })).id;
  });
  afterAll(async () => t?.drop());

  let careId = '';
  let washId = '';
  let authorId = '';

  it('keeps categories two levels deep and authors honest; puts them away and restores them', async () => {
    const care = await shelf('categories', 'POST', null, { slug: 'care', nameEn: 'Care', nameBn: 'যত্ন', introEn: 'Keep clothes new.' });
    expect(care.status).toBe(201);
    careId = care.j.categories[0].id;
    const wash = await shelf('categories', 'POST', null, { slug: 'washing', nameEn: 'Washing', parentId: careId });
    washId = wash.j.categories.find((c: any) => c.slug === 'washing').id;
    expect(wash.j.categories.find((c: any) => c.slug === 'washing').parentId).toBe(careId);
    expect((await shelf('categories', 'POST', null, { slug: 'deep', nameEn: 'Deep', parentId: washId })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['parentId'] });
    expect((await shelf('categories', 'POST', null, { slug: 'care', nameEn: 'Again' })).j.error).toBe('SLUG_TAKEN');
    const careRow = wash.j.categories.find((c: any) => c.id === careId);
    expect((await shelf('categories', 'POST', careId, { action: 'archive', version: careRow.version })).j.error).toBe('HAS_CHILDREN');
    // PR 593: saveAuthor's own response also seeds the five-member AI team (`journalAuthors` → `ensureAuthorTeam`),
    // alphabetically ahead of 'Suta' (Bazar, Jotno, Ritu, Rong), so this test's own author is never index [0] —
    // found by its slug instead, same as every other author lookup below.
    const bySlug = (rows: any[]) => rows.find((x: any) => x.slug === 'suta');
    const a = await shelf('authors', 'POST', null, { slug: 'suta', displayName: 'Suta', isAiAuthor: true, bioEn: 'Care and washing.' });
    const created = bySlug(a.j.authors);
    authorId = created.id;
    const off = await shelf('authors', 'POST', authorId, { action: 'archive', version: created.version });
    expect(bySlug(off.j.authors).archived).toBe(true);
    const back = await shelf('authors', 'POST', authorId, { action: 'restore', version: bySlug(off.j.authors).version });
    expect(bySlug(back.j.authors).archived).toBe(false);
    // PR 593's team (4 more besides the shared 'suta' slug, skipped as a duplicate) now seeds on every shelf read.
    expect(await t.prisma.blogAuthor.count()).toBe(5);
  });

  let postId = '';
  let version = '';

  it('makes an article, counts its words, refuses a stale save, a link taken twice and another store’s product', async () => {
    const body = '## Wash cold\n\nTurn the polo inside out and wash it cold.\n\n[products]';
    const made = await posts('POST', null, { locale: 'en', title: 'How to wash a polo', body, categoryId: washId, authorId, productIds: [productId] });
    expect(made.status).toBe(201);
    expect(made.j.post).toMatchObject({ slug: 'how-to-wash-a-polo', status: 'DRAFT', column: 'writing', wordCount: 11, readingMinutes: 2, live: false });
    postId = made.j.post.id;
    version = made.j.post.version;
    const saved = await posts('PUT', postId, { version, locale: 'en', title: 'How to wash a polo', body: `${body}\n\nDry it flat.`, categoryId: washId, authorId, productIds: [productId], focusKeyword: 'wash polo' });
    expect(saved.j.post.focusKeyword).toBe('wash polo');
    expect((await posts('PUT', postId, { version, locale: 'en', title: 'x', body })).j.error).toBe('STALE');
    version = saved.j.post.version;
    expect((await posts('POST', null, { locale: 'en', title: 'How to wash a polo' })).j.error).toBe('SLUG_TAKEN');
    expect((await posts('POST', null, { locale: 'bn', title: 'পোলো ধোয়ার নিয়ম' })).j).toMatchObject({ error: 'INVALID_INPUT', details: ['slug'] });
    const bn = await posts('POST', null, { locale: 'bn', title: 'পোলো ধোয়ার নিয়ম', slug: 'how-to-wash-a-polo', body: 'ঠান্ডা পানিতে ধুন' });
    expect(bn.status).toBe(201);
    expect((await posts('POST', null, { locale: 'en', title: 'Other', productIds: [otherStoreProduct] })).j.details).toEqual(['productIds']);
  });

  it('passes three review steps with their history, refuses the writer on his own article, and sends an edit back', async () => {
    const who = (actor: Actor) => ({ actor, ctx });
    const p = await saveJournalPost(t.prisma, deps.resolver, who(writer), null, { locale: 'en', title: 'Linen in summer', body: 'Linen breathes.' }, clock.now);
    await deps.resolver.set('blog.journal', { ...registry['blog.journal'].default, reviewByAnother: true }, storeTarget(S));
    expect(await code(journalAction(t.prisma, deps.resolver, who(writer), p.id, { action: 'pass', version: p.version }, clock.now))).toBe('OWN_ARTICLE');
    let v = await journalAction(t.prisma, deps.resolver, who(editor), p.id, { action: 'pass', version: p.version }, clock.now);
    v = await journalAction(t.prisma, deps.resolver, who(editor), p.id, { action: 'pass', version: v.version }, clock.now);
    expect(v.status).toBe('FACT_CHECKED');
    expect(await code(journalAction(t.prisma, deps.resolver, who(editor), p.id, { action: 'publish', version: v.version }, clock.now))).toBe('FORBIDDEN');
    const edited = await saveJournalPost(t.prisma, deps.resolver, who(editor), p.id, { version: v.version, locale: 'en', title: 'Linen in summer', body: 'Linen breathes well.' }, clock.now);
    expect(edited.status).toBe('DRAFT');
    expect(edited.reviews.map((r) => `${r.stage}:${r.verdict}`)).toEqual(['proof:pass', 'facts:pass']);
    expect(edited.reviews[0]!.reviewer).toBe('editor');
    await deps.resolver.set('blog.journal', registry['blog.journal'].default, storeTarget(S));
  });

  it('schedules an article, serves it once its time comes and only in its language; takes it down; never deletes', async () => {
    let v = (await posts('GET', postId)).j.post;
    for (let i = 0; i < 3; i++) v = (await posts('POST', postId, { action: 'pass', version: v.version })).j.post;
    expect(v.status).toBe('SEO_CHECKED');
    expect((await posts('POST', postId, { action: 'schedule', version: v.version, scheduledAt: '2026-11-06T05:00:00Z' })).j.details).toEqual(['scheduledAt']);
    v = (await posts('POST', postId, { action: 'schedule', version: v.version, scheduledAt: '2026-11-06T08:00:00Z' })).j.post;
    expect(v).toMatchObject({ status: 'SCHEDULED', column: 'scheduled', live: false });
    expect(await livePost(t.prisma, S, 'en', 'how-to-wash-a-polo', clock.now)).toBeNull();
    const later = new Date('2026-11-06T08:30:00Z');
    const live = await livePost(t.prisma, S, 'en', 'how-to-wash-a-polo', later);
    expect(live).toMatchObject({ title: 'How to wash a polo', productIds: [productId], category: { slug: 'washing' }, author: { displayName: 'Suta', isAiAuthor: true } });
    expect(await livePost(t.prisma, S, 'bn', 'how-to-wash-a-polo', later)).toBeNull();
    expect(await livePost(t.prisma, S + 1, 'en', 'how-to-wash-a-polo', later)).toBeNull();
    expect((await liveJournal(t.prisma, S, 'en', { page: 1, perPage: 12, categoryIds: [careId, washId] }, later)).total).toBe(1);
    // published by hand after its time (directly: the signed-in session lives on the test clock)
    const ownerId = (await t.prisma.staffUser.findFirstOrThrow({ where: { email: 'owner@example.com' }, select: { id: true } })).id;
    v = await journalAction(t.prisma, deps.resolver, { actor: { staffUserId: ownerId }, ctx }, postId, { action: 'publish', version: v.version }, later);
    expect(v.publishedAt).toBe('2026-11-06T08:00:00.000Z');
    expect((await posts('POST', postId, { action: 'archive', version: v.version })).j.error).toBe('WRONG_STATE');
    v = (await posts('POST', postId, { action: 'unpublish', version: v.version })).j.post;
    expect(await livePost(t.prisma, S, 'en', 'how-to-wash-a-polo', later)).toBeNull();
    v = (await posts('POST', postId, { action: 'archive', version: v.version })).j.post;
    expect(v.status).toBe('ARCHIVED');
    expect((await posts('PUT', postId, { version: v.version, locale: 'en', title: 'x' })).j.error).toBe('ARCHIVED');
    v = (await posts('POST', postId, { action: 'restore', version: v.version })).j.post;
    expect(v.status).toBe('DRAFT');
    const list = (await posts('GET', null)).j;
    expect(list.list.rows.length).toBe(3);
    expect(list.list.counts.writing).toBe(3);
    expect(list.choices.products.map((p: any) => p.id)).toEqual([productId]);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'blog.' } } })).toBeGreaterThan(10);
  });

  it('PR 249: the live twin either way, "Read next" (plan first, then topic, newest first) and the sitemap`s articles', async () => {
    const at = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
    const plan = '0190f000-0000-7000-8000-000000000249';
    const mk = (slug: string, locale: 'en' | 'bn', o: { h: number; clusterId?: string | null; categoryId?: string | null; status?: 'PUBLISHED' | 'DRAFT'; twinPostId?: string }) =>
      t.prisma.blogPost.create({
        data: { storeId: S, slug, locale, title: slug, body: 'Words.', status: o.status ?? 'PUBLISHED', publishedAt: at(o.h), clusterId: o.clusterId ?? null, categoryId: o.categoryId ?? null, twinPostId: o.twinPostId ?? null },
        select: { id: true },
      });
    const pillar = await mk('seo-pillar', 'en', { h: 1, clusterId: plan, categoryId: careId });
    const sib = await mk('seo-sibling', 'en', { h: 2, clusterId: plan });
    await mk('seo-sibling-draft', 'en', { h: 5, clusterId: plan, status: 'DRAFT' });
    const topicNew = await mk('seo-topic-new', 'en', { h: 4, categoryId: careId });
    const topicOld = await mk('seo-topic-old', 'en', { h: 3, categoryId: careId });
    const twin = await mk('seo-pillar-bn', 'bn', { h: 2, clusterId: plan, categoryId: careId, twinPostId: pillar.id });
    await mk('seo-bn-alone', 'bn', { h: 3 });
    const now = new Date('2026-11-06T09:00:00Z');
    const p = (await livePost(t.prisma, S, 'en', 'seo-pillar', now))!;
    expect(p).toMatchObject({ clusterId: plan, categoryId: careId, twinPostId: null });
    expect(await liveTwinSlug(t.prisma, S, p, now)).toBe('seo-pillar-bn');
    const b = (await livePost(t.prisma, S, 'bn', 'seo-pillar-bn', now))!;
    expect(await liveTwinSlug(t.prisma, S, b, now)).toBe('seo-pillar');
    expect(await liveTwinSlug(t.prisma, S, (await livePost(t.prisma, S, 'bn', 'seo-bn-alone', now))!, now)).toBeNull();
    // follow-up 659: the language switch lands on the twin's own link; no twin: the journal; nothing live: none
    expect(await switchTarget(t.prisma, S, 'bn', 'seo-pillar', now)).toEqual({ twin: 'seo-pillar-bn' });
    expect(await switchTarget(t.prisma, S, 'en', 'seo-pillar-bn', now)).toEqual({ twin: 'seo-pillar' });
    expect(await switchTarget(t.prisma, S, 'en', 'seo-bn-alone', now)).toEqual({ twin: null });
    expect(await switchTarget(t.prisma, S, 'bn', 'no-such-article', now)).toBeNull();
    expect((await liveRelated(t.prisma, S, p, 3, now)).map((x) => x.id)).toEqual([sib.id, topicNew.id, topicOld.id]);
    expect((await liveRelated(t.prisma, S, p, 2, now)).map((x) => x.id)).toEqual([sib.id, topicNew.id]);
    expect(await liveRelated(t.prisma, S, p, 0, now)).toEqual([]);
    expect((await liveRelated(t.prisma, S, b, 3, now)).map((x) => x.id)).toEqual([]);
    expect((await liveRelated(t.prisma, S + 1, p, 3, now)).length).toBe(0);
    const map = await liveSitemapPosts(t.prisma, S, 100, now);
    expect(map.en.map((x) => x.slug)).toEqual(expect.arrayContaining(['seo-pillar', 'seo-sibling', 'seo-topic-new', 'seo-topic-old']));
    expect(map.en.map((x) => x.slug)).not.toContain('seo-sibling-draft');
    expect(map.bn.find((x) => x.id === twin.id)?.twinPostId).toBe(pillar.id);
  });

  it('switches the journal on only for a publisher, at its version; refuses a signed-out caller', async () => {
    const list = (await posts('GET', null)).j;
    const card = list.cards.journal;
    const on = await posts('PUT', null, { key: 'journal', value: { ...card.value, on: true }, version: card.version });
    expect(on.j.cards.journal.value.on).toBe(true);
    expect((await posts('PUT', null, { key: 'journal', value: { ...card.value, on: false }, version: card.version })).j.error).toBe('STALE');
    expect((await posts('GET', null, undefined, '')).status).toBe(401);
  });
});
