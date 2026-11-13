// S28 · PR 682 — FAQs on a real PostgreSQL: product, category and shop-wide; made from an answered question; who may
// change them; store isolation; archived (never deleted); audited.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { archiveFaq, createFaq, listFaqs, makeFaqFromQuestion, updateFaq, type CatalogueDeps, type SettingsReader, type Who } from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('FAQs on PostgreSQL (PR 682)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let editor: Actor;
  let reader: Actor;
  let product = '';
  let category = '';
  let otherProduct = '';
  let answered = '';
  let unanswered = '';

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_faq');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]): Promise<Actor> => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    editor = await staff('f-editor@example.com', ['catalogue.read', 'catalogue.write']);
    reader = await staff('f-reader@example.com', ['catalogue.read']);
    category = (await t.prisma.category.create({ data: { storeId: A, slug: 'f-polo', nameEn: 'Polo' }, select: { id: true } })).id;
    product = (await t.prisma.product.create({ data: { storeId: A, slug: 'f-p1', nameEn: 'Polo one', categoryId: category }, select: { id: true } })).id;
    otherProduct = (await t.prisma.product.create({ data: { storeId: B, slug: 'f-p2', nameEn: 'Other shop polo' }, select: { id: true } })).id;
    answered = (
      await t.prisma.productQuestion.create({
        data: { storeId: A, productId: product, question: 'Is it pre-shrunk?', answer: 'Yes, washed before cutting.', status: 'APPROVED' },
        select: { id: true },
      })
    ).id;
    unanswered = (await t.prisma.productQuestion.create({ data: { storeId: A, productId: product, question: 'Is there XXL?', status: 'PENDING' }, select: { id: true } })).id;
  }, 300_000);
  afterAll(async () => t?.drop());

  it('adds a question to a product, a category and the whole shop, and checks what each needs', async () => {
    const p = await createFaq(deps(), as(editor), { scope: 'PRODUCT', productId: product, questionEn: 'Q product', answerEn: 'A' });
    const c = await createFaq(deps(), as(editor), { scope: 'CATEGORY', categoryId: category, questionEn: 'Q category', answerEn: 'A' });
    const s = await createFaq(deps(), as(editor), { scope: 'SHOP', questionEn: 'Q shop', answerEn: 'A', questionBn: 'প্রশ্ন', answerBn: 'উত্তর' });
    expect([p.scope, c.scope, s.scope]).toEqual(['PRODUCT', 'CATEGORY', 'SHOP']);
    expect(await code(createFaq(deps(), as(editor), { scope: 'PRODUCT', questionEn: 'x', answerEn: 'y' }))).toBe('INVALID_INPUT');
    expect(await code(createFaq(deps(), as(editor), { scope: 'SHOP', productId: product, questionEn: 'x', answerEn: 'y' }))).toBe('INVALID_INPUT');
    expect(await code(createFaq(deps(), as(editor), { scope: 'CATEGORY', productId: product, questionEn: 'x', answerEn: 'y' }))).toBe('INVALID_INPUT');
    expect((await listFaqs(deps(), as(reader))).length).toBe(3);
    expect((await listFaqs(deps(), as(reader), { scope: 'CATEGORY', categoryId: category })).map((x) => x.questionEn)).toEqual(['Q category']);
  });

  it("is the store's own: another store's product is not found, and a reader cannot change", async () => {
    expect(await code(createFaq(deps(), as(editor), { scope: 'PRODUCT', productId: otherProduct, questionEn: 'x', answerEn: 'y' }))).toBe('NOT_FOUND');
    expect(await code(createFaq(deps(), as(reader), { scope: 'SHOP', questionEn: 'x', answerEn: 'y' }))).toBe('FORBIDDEN');
    expect(await listFaqs(deps(), as(editor, B)).catch((e) => (e as { code?: string }).code)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ questionEn: 'Q shop' })]),
    );
  });

  it('edits, hides and archives; an archived FAQ stays in the table', async () => {
    const [first] = await listFaqs(deps(), as(reader), { scope: 'SHOP' });
    const u = await updateFaq(deps(), as(editor), first!.id, { answerEn: 'New answer', isActive: false });
    expect(u).toMatchObject({ answerEn: 'New answer', isActive: false });
    await archiveFaq(deps(), as(editor), first!.id);
    expect((await listFaqs(deps(), as(reader), { scope: 'SHOP' })).length).toBe(0);
    expect((await listFaqs(deps(), as(reader), { scope: 'SHOP', archived: true })).length).toBe(1);
    expect(await t.prisma.productFaq.count({ where: { id: first!.id } })).toBe(1);
    await archiveFaq(deps(), as(editor), first!.id, false);
    expect((await listFaqs(deps(), as(reader), { scope: 'SHOP' })).length).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { entityType: 'ProductFaq', action: { in: ['faq.create', 'faq.update', 'faq.archive'] } } })).toBeGreaterThanOrEqual(5);
  });

  it('makes an answered, published question an FAQ once per place, and refuses an unanswered one', async () => {
    const f = await makeFaqFromQuestion(deps(), as(editor), answered, { scope: 'CATEGORY' });
    expect(f).toMatchObject({ scope: 'CATEGORY', categoryId: category, questionEn: 'Is it pre-shrunk?', answerEn: 'Yes, washed before cutting.', sourceQuestionId: answered });
    expect(await code(makeFaqFromQuestion(deps(), as(editor), answered, { scope: 'CATEGORY' }))).toBe('CONFLICT');
    expect((await makeFaqFromQuestion(deps(), as(editor), answered, { scope: 'PRODUCT' })).productId).toBe(product);
    expect(await code(makeFaqFromQuestion(deps(), as(editor), unanswered, { scope: 'PRODUCT' }))).toBe('CONFLICT');
    expect(await code(makeFaqFromQuestion(deps(), as(reader), answered, { scope: 'SHOP' }))).toBe('FORBIDDEN');
    expect((await t.prisma.productQuestion.findUnique({ where: { id: answered } }))!.answer).toBe('Yes, washed before cutting.');
  });
});
