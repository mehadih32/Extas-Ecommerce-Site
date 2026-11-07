// PR 66 follow-up 184 — product questions on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): who may read
// and answer them, publish only with an answer, hide, archive and bring back (never deleted), each audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { answerQuestion, listQuestions, moveQuestion, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('product questions on PostgreSQL (follow-up 184)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const clock = new Date('2026-11-07T06:00:00Z');
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let viewer: Actor;
  let moderator: Actor;
  let nobody: Actor;
  let product = '';
  const q: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_questions');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    viewer = await staff('q-viewer@example.com', ['reviews.read']);
    moderator = await staff('q-moderator@example.com', ['reviews.read', 'reviews.moderate']);
    nobody = await staff('q-nobody@example.com', ['catalogue.read']);
    const cat = await t.prisma.category.create({ data: { storeId: A, slug: 'q-polos', nameEn: 'Polos', nameBn: 'পোলো' }, select: { id: true } });
    product = (await t.prisma.product.create({ data: { storeId: A, slug: 'q-polo', nameEn: 'Sample polo', status: 'PUBLISHED', categoryId: cat.id }, select: { id: true } })).id;
    for (const [k, text] of [['cotton', 'Is it 100% cotton?'], ['wash', 'Can it be machine washed?'], ['spam', 'Sample unrelated question']] as const) {
      q[k] = (await t.prisma.productQuestion.create({ data: { storeId: A, productId: product, question: text, createdAt: new Date(clock.getTime() - Object.keys(q).length * 60_000) }, select: { id: true } })).id;
    }
  }, 300_000);

  afterAll(async () => t?.drop());

  it('reading needs reviews.read and answering reviews.moderate, in the acting store only', async () => {
    expect(await code(listQuestions(deps(), as(viewer)))).toBe('ok');
    expect(await code(listQuestions(deps(), as(viewer, B)))).toBe('FORBIDDEN');
    expect(await code(listQuestions(deps(), as(nobody)))).toBe('FORBIDDEN');
    expect(await code(answerQuestion(deps(), as(viewer), q.cotton!, { answer: 'Yes.' }))).toBe('FORBIDDEN');
    expect(await code(moveQuestion(deps(), as(viewer), q.cotton!, { action: 'hide' }))).toBe('FORBIDDEN');
    // another store's moderator never reaches this store's question
    expect(await code(moveQuestion(deps(), as(moderator, B), q.cotton!, { action: 'hide' }))).toBe('FORBIDDEN');
  });

  it('the queue lists the new questions with their counts, newest first, and never the asker', async () => {
    const l = await listQuestions(deps(), as(viewer));
    expect(l.questions.map((x) => x.id)).toEqual([q.cotton, q.wash, q.spam]);
    expect(l.counts).toEqual({ open: 3, published: 0, hidden: 0, archived: 0, unanswered: 3 });
    expect(l.questions[0]).not.toHaveProperty('customerId');
  });

  it('publishing needs an answer; answer and publish in one step; the product page rule then holds', async () => {
    expect(await code(moveQuestion(deps(), as(moderator), q.wash!, { action: 'publish' }))).toBe('CONFLICT');
    expect(await code(answerQuestion(deps(), as(moderator), q.cotton!, { answer: '   ' }))).toBe('INVALID_INPUT');
    const a = await answerQuestion(deps(), as(moderator), q.cotton!, { answer: 'Yes, 100% combed cotton.', publish: true });
    expect(a).toMatchObject({ status: 'APPROVED', answer: 'Yes, 100% combed cotton.', answeredAt: clock.toISOString() });
    const saved = await answerQuestion(deps(), as(moderator), q.wash!, { answer: 'Yes, cold and gentle.' });
    expect(saved.status).toBe('PENDING');
    expect((await moveQuestion(deps(), as(moderator), q.wash!, { action: 'publish' })).status).toBe('APPROVED');
    const shown = await t.prisma.productQuestion.count({ where: { storeId: A, productId: product, status: 'APPROVED', archivedAt: null, answer: { not: null } } });
    expect(shown).toBe(2);
  });

  it('hide, archive and bring back keep the row; bring back asks for a new check; each step is audited', async () => {
    expect((await moveQuestion(deps(), as(moderator), q.spam!, { action: 'hide' })).status).toBe('HIDDEN');
    const archived = await moveQuestion(deps(), as(moderator), q.spam!, { action: 'archive' });
    expect(archived.archived).toBe(true);
    expect(await code(answerQuestion(deps(), as(moderator), q.spam!, { answer: 'x' }))).toBe('CONFLICT');
    expect((await listQuestions(deps(), as(viewer), { view: 'archived' })).questions.map((x) => x.id)).toEqual([q.spam]);
    const back = await moveQuestion(deps(), as(moderator), q.spam!, { action: 'unarchive' });
    expect(back).toMatchObject({ archived: false, status: 'PENDING' });
    expect(await t.prisma.productQuestion.count({ where: { storeId: A } })).toBe(3);
    const log = await t.prisma.auditLog.findMany({ where: { storeId: A, entityType: 'ProductQuestion' }, select: { action: true }, orderBy: { createdAt: 'asc' } });
    expect(log.map((x) => x.action)).toEqual(['questions.answer', 'questions.answer', 'questions.publish', 'questions.hide', 'questions.archive', 'questions.unarchive']);
  });
});
