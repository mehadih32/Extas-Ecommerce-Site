// S12 · PR 592 follow-up — the journal's browsing on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): an
// article's tags saved from the names typed (a Bengali tag gets a Latin link, the same name once, taken off and put
// back), its expert reviewer (never its own author, never one put away), a tag's page and a person's page (written and
// reviewed, live articles of the language only), the journal's search (best first, nothing for one letter), the
// popular tags, the people with live articles and the RSS feed's newest articles. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRole, syncAuth, SYSTEM, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { liveByPerson, liveByTag, livePeople, popularTags, rssPosts, searchJournal } from './browse';
import { journalPost, livePost, saveJournalPost } from './journal';
import { tagSlug } from './model';
import type { AdminDeps } from '../admin-auth';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string; details?: string[] }).code + ':' + ((e as { details?: string[] }).details ?? []).join(',');
  }
}

describe.skipIf(!HAS_TEST_DB)('the journal as a full section on PostgreSQL (PR 592 follow-up)', () => {
  let t: TestDatabase;
  let resolver: AdminDeps['resolver'];
  let writer: Actor;
  const S = MOTHER_STORE_ID;
  const now = new Date('2026-11-06T06:00:00Z');
  const ctx = { ip: '192.0.2.62', userAgent: 'SampleBrowser/1.0' };
  const who = () => ({ actor: writer, ctx });
  let ana = '';
  let bilal = '';
  let gone = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('jbrowse');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    const role = await createRole(t.prisma, SYSTEM, { key: 'jb-writer', nameEn: 'jb-writer', nameBn: 'jb-writer', permissions: ['blog.read', 'blog.write', 'blog.publish'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'jb@example.com', displayName: 'jb', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { staffUserId: u.id };
    const mk = (slug: string, displayName: string, extra: object = {}) => t.prisma.blogAuthor.create({ data: { storeId: S, slug, displayName, ...extra }, select: { id: true } }).then((x) => x.id);
    ana = await mk('ana', 'Sample Ana', { bioEn: 'Writes about care.', bioBn: 'যত্ন নিয়ে লেখেন।' });
    bilal = await mk('bilal', 'Sample Bilal', { reviewerLine: 'Sample textile engineer' });
    gone = await mk('gone', 'Put away', { archivedAt: now });
  });
  afterAll(async () => t?.drop());

  let washId = '';
  it('saves the tags typed (once each, a Bengali tag with a Latin link) and the reviewer, and changes them on the next save', async () => {
    const p = await saveJournalPost(t.prisma, resolver, who(), null, { locale: 'en', title: 'How to wash a polo', body: 'Cold water keeps the colour.', authorId: ana, reviewerAuthorId: bilal, tags: ['Polo', '#washing', 'polo', 'ধোয়া'] }, now);
    washId = p.id;
    expect(p.reviewerAuthorId).toBe(bilal);
    expect(p.tags).toEqual(['Polo', 'washing', 'ধোয়া']);
    const slugs = (await t.prisma.blogTag.findMany({ where: { storeId: S }, orderBy: { createdAt: 'asc' }, select: { slug: true } })).map((x) => x.slug);
    expect(slugs).toEqual(['polo', 'washing', tagSlug('ধোয়া')]);
    expect(tagSlug('ধোয়া')).toMatch(/^t-[0-9a-f]{8}$/);
    const again = await saveJournalPost(t.prisma, resolver, who(), p.id, { version: p.version, locale: 'en', title: 'How to wash a polo', body: 'Cold water keeps the colour.', authorId: ana, reviewerAuthorId: bilal, tags: ['washing', 'cotton'] }, now);
    expect(again.tags).toEqual(['washing', 'cotton']);
    // a tag taken off stays (nothing deleted from the tag list), it just has no article
    expect(await t.prisma.blogTag.count({ where: { storeId: S } })).toBe(4);
    expect((await journalPost(t.prisma, p.id, now))!.tags).toEqual(['washing', 'cotton']);
  });

  it('refuses the article\'s own author, someone put away or an unknown person as its reviewer, and a reserved link', async () => {
    const base = { locale: 'en' as const, title: 'Another polo note', body: 'Words.', authorId: ana };
    expect(await code(saveJournalPost(t.prisma, resolver, who(), null, { ...base, reviewerAuthorId: ana }, now))).toBe('INVALID_INPUT:reviewerAuthorId');
    expect(await code(saveJournalPost(t.prisma, resolver, who(), null, { ...base, reviewerAuthorId: gone }, now))).toBe('INVALID_INPUT:reviewerAuthorId');
    expect(await code(saveJournalPost(t.prisma, resolver, who(), null, { ...base, reviewerAuthorId: '00000000-0000-7000-8000-000000000009' }, now))).toBe('INVALID_INPUT:reviewerAuthorId');
    expect(await code(saveJournalPost(t.prisma, resolver, who(), null, { ...base, slug: 'search' }, now))).toBe('INVALID_INPUT:slug');
  });

  it('reads the tags and the reviewer with a live article, and builds the tag, person and search pages from live articles only', async () => {
    await t.prisma.blogPost.update({ where: { id: washId }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-11-01T06:00:00Z') } });
    const draft = await saveJournalPost(t.prisma, resolver, who(), null, { locale: 'en', title: 'Washing denim (draft)', body: 'Not live yet.', authorId: bilal, tags: ['washing'] }, now);
    const shirt = await saveJournalPost(t.prisma, resolver, who(), null, { locale: 'en', title: 'Shirt fit notes', body: 'A word on washing at the end.', authorId: bilal, reviewerAuthorId: ana, tags: ['washing', 'fit'] }, now);
    await t.prisma.blogPost.update({ where: { id: shirt.id }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-11-03T06:00:00Z') } });
    const bn = await saveJournalPost(t.prisma, resolver, who(), null, { locale: 'bn', slug: 'polo-dhoa', title: 'পোলো ধোয়া', body: 'ঠান্ডা পানি।', authorId: ana, tags: ['washing'] }, now);
    await t.prisma.blogPost.update({ where: { id: bn.id }, data: { status: 'PUBLISHED', publishedAt: new Date('2026-11-02T06:00:00Z') } });

    const live = (await livePost(t.prisma, S, 'en', 'how-to-wash-a-polo', now))!;
    expect(live.tags.map((x) => x.slug)).toEqual(['washing', 'cotton']);
    expect(live.reviewer).toEqual({ slug: 'bilal', displayName: 'Sample Bilal', isAiAuthor: false });

    const tag = (await liveByTag(t.prisma, S, 'en', 'washing', 1, 12, now))!;
    expect(tag.tag.name).toBe('washing');
    expect(tag.posts.map((x) => x.slug)).toEqual(['shirt-fit-notes', 'how-to-wash-a-polo']); // newest first, never the draft
    expect(tag.total).toBe(2);
    expect((await liveByTag(t.prisma, S, 'bn', 'washing', 1, 12, now))!.posts.map((x) => x.slug)).toEqual(['polo-dhoa']);
    expect(await liveByTag(t.prisma, S, 'en', 'no-such-tag', 1, 12, now)).toBeNull();

    const b = (await liveByPerson(t.prisma, S, 'en', 'bilal', 1, 12, now))!;
    expect(b.person).toMatchObject({ displayName: 'Sample Bilal', reviewerLine: 'Sample textile engineer' });
    expect(b.written.posts.map((x) => x.slug)).toEqual(['shirt-fit-notes']); // the draft is not live
    expect(b.reviewed.posts.map((x) => x.slug)).toEqual(['how-to-wash-a-polo']);
    const a = (await liveByPerson(t.prisma, S, 'bn', 'ana', 1, 12, now))!;
    expect(a.person.bio).toBe('যত্ন নিয়ে লেখেন।');
    expect(a.written.posts.map((x) => x.slug)).toEqual(['polo-dhoa']);
    expect(await liveByPerson(t.prisma, S, 'en', 'gone', 1, 12, now)).toBeNull();

    const found = await searchJournal(t.prisma, S, 'en', 'washing polo', 1, 12, now);
    expect(found.posts.map((x) => x.slug)).toEqual(['how-to-wash-a-polo', 'shirt-fit-notes']); // title + tag beats the text
    expect((await searchJournal(t.prisma, S, 'en', 'x', 1, 12, now)).total).toBe(0);
    expect((await searchJournal(t.prisma, S, 'en', 'denim', 1, 12, now)).total).toBe(0); // only in the draft
    // 'washing': the shirt note has it as a tag and in its text, the polo article only as a tag; page 2 of one a page
    expect((await searchJournal(t.prisma, S, 'en', 'washing', 2, 1, now)).posts.map((x) => x.slug)).toEqual(['how-to-wash-a-polo']);

    expect((await popularTags(t.prisma, S, 'en', 12, now)).map((x) => [x.slug, x.count])).toEqual(expect.arrayContaining([['washing', 2], ['cotton', 1], ['fit', 1]]));
    expect((await popularTags(t.prisma, S, 'en', 12, now))[0]).toMatchObject({ slug: 'washing', count: 2 });
    expect((await livePeople(t.prisma, S, 'en', now)).map((x) => x.slug)).toEqual(['ana', 'bilal']);
    expect((await rssPosts(t.prisma, S, 'en', 5, now)).map((x) => x.slug)).toEqual(['shirt-fit-notes', 'how-to-wash-a-polo']);
    expect((await rssPosts(t.prisma, S, 'en', 1, now)).length).toBe(1);
    expect(draft.status).toBe('DRAFT');
  });
});
