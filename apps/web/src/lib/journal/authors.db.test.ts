// S12 · PR 593 — the five AI author sub-agents under Doot on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL): the team seeds itself once, by slug, the first time the shelf or the plan reads it,
// never a second time and never over the owner's own edit; a topic given a section with no author by hand gets the
// matching one of the five; "Start writing" never lets an AI author review its own post, and the next review goes to
// whichever of the others is carrying the fewest right now. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { ensureAuthorTeam, journalAuthors, saveAuthor } from './journal';
import { saveTopic, topicAction } from './clusters';

const OWNER_PW = 'a long sentence for the tests';
const ctx = { ip: '192.0.2.70', userAgent: 'SampleBrowser/1.0' };

describe.skipIf(!HAS_TEST_DB)('Website › Blog & journal › the author team under Doot on PostgreSQL (PR 593)', () => {
  let t: TestDatabase;
  let resolver: SettingsResolver;
  let owner: Actor;
  const S = MOTHER_STORE_ID;

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('blog_authors');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const o = await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    owner = { staffUserId: o.id };
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
  });
  afterAll(async () => t?.drop());

  it('seeds exactly the five, by slug, idempotently, and never overwrites the owner\'s own edit', async () => {
    const first = await journalAuthors(t.prisma, S);
    const ai = first.filter((a) => a.isAiAuthor);
    expect(ai.map((a) => a.slug).sort()).toEqual(['bazar', 'jotno', 'rong', 'ritu', 'suta']);
    expect(ai.map((a) => a.agentKey).sort()).toEqual(['A360-08', 'A360-09', 'A360-10', 'A360-11', 'A360-12']);
    expect(ai.every((a) => a.bioEn && a.bioBn)).toBe(true);

    const jotno = ai.find((a) => a.slug === 'jotno')!;
    await saveAuthor(t.prisma, { actor: owner, ctx }, jotno.id, { version: jotno.version, slug: jotno.slug, displayName: 'Jotno', isAiAuthor: true, bioEn: 'Owner-written bio', bioBn: jotno.bioBn, reviewerLine: 'Reviewed with Tanvir, our care-lab lead' });

    // reading the shelf again (and so re-running ensureAuthorTeam) must not touch the edit, nor add a sixth row.
    await ensureAuthorTeam(t.prisma, S);
    const second = await journalAuthors(t.prisma, S);
    expect(second.filter((a) => a.isAiAuthor).length).toBe(5);
    const jotno2 = second.find((a) => a.id === jotno.id)!;
    expect(jotno2).toMatchObject({ bioEn: 'Owner-written bio', reviewerLine: 'Reviewed with Tanvir, our care-lab lead' });
  });

  it('a topic given a section and no author by hand gets the matching one of the five', async () => {
    const id = await saveTopic(t.prisma, resolver, { actor: owner, ctx }, null, { title: 'How to wash a cotton panjabi', query: 'wash cotton panjabi', locale: 'en', pillar: 'care' });
    const topic = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id } });
    const authors = await journalAuthors(t.prisma, S);
    const jotno = authors.find((a) => a.slug === 'jotno')!;
    expect(topic.pillar).toBe('care');
    expect(topic.authorId).toBe(jotno.id);

    // an author chosen by hand is never overridden.
    const suta = authors.find((a) => a.slug === 'suta')!;
    const id2 = await saveTopic(t.prisma, resolver, { actor: owner, ctx }, null, { title: 'How to fold a cotton panjabi', query: 'fold cotton panjabi', locale: 'en', pillar: 'care', authorId: suta.id });
    const topic2 = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: id2 } });
    expect(topic2.authorId).toBe(suta.id);
  });

  it('"Start writing" never lets the AI author review its own post, and rotates the review to the least-loaded other', async () => {
    const authors = await journalAuthors(t.prisma, S);
    const jotno = authors.find((a) => a.slug === 'jotno')!;

    const id = await saveTopic(t.prisma, resolver, { actor: owner, ctx }, null, { title: 'Washing linen shirts without shrinking', query: 'wash linen shirt', locale: 'en', pillar: 'care' });
    const t1 = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id } });
    const { postId: p1 } = await topicAction(t.prisma, { actor: owner, ctx }, id, { action: 'start', version: t1.updatedAt.toISOString() });
    const post1 = await t.prisma.blogPost.findUniqueOrThrow({ where: { id: p1! } });
    expect(post1.authorId).toBe(jotno.id);
    expect(post1.reviewerAuthorId).not.toBeNull();
    expect(post1.reviewerAuthorId).not.toBe(jotno.id);

    const id2 = await saveTopic(t.prisma, resolver, { actor: owner, ctx }, null, { title: 'Hand-washing wool sweaters at home', query: 'hand wash wool', locale: 'en', pillar: 'care' });
    const t2 = await t.prisma.blogTopic.findUniqueOrThrow({ where: { id: id2 } });
    const { postId: p2 } = await topicAction(t.prisma, { actor: owner, ctx }, id2, { action: 'start', version: t2.updatedAt.toISOString() });
    const post2 = await t.prisma.blogPost.findUniqueOrThrow({ where: { id: p2! } });
    expect(post2.authorId).toBe(jotno.id);
    expect(post2.reviewerAuthorId).not.toBeNull();
    expect(post2.reviewerAuthorId).not.toBe(jotno.id);
    // the first reviewer is now carrying one review, so the second goes to someone else.
    expect(post2.reviewerAuthorId).not.toBe(post1.reviewerAuthorId);
  });
});
