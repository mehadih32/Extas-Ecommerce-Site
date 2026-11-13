// S28 · PR 682 — product, category and shop-wide FAQs (`ProductFaq`). A question can be on one product, on every product
// of a category (attached by itself) or shop-wide, and can be made from an answered customer question ("Make this an
// FAQ"). Nothing is deleted: a FAQ is hidden or archived. Reading needs `catalogue.read`, every change `catalogue.write`;
// every change is audited. Whether the shop shows them is the setting `catalogue.faq` (off as shipped).
import { z } from 'zod';
import { CatalogueError } from './errors';
import { allow, found, logChange, parse, type CatalogueDeps, type Who } from './context';

export { pickFaqs, type FaqPickRow, type PickedFaq } from './faq-pick';

export const FAQ_SCOPES = ['PRODUCT', 'CATEGORY', 'SHOP'] as const;
export type FaqScopeKey = (typeof FAQ_SCOPES)[number];

export interface FaqView {
  id: string;
  scope: FaqScopeKey;
  productId: string | null;
  categoryId: string | null;
  questionEn: string;
  questionBn: string | null;
  answerEn: string;
  answerBn: string | null;
  sortOrder: number;
  isActive: boolean;
  sourceQuestionId: string | null;
  archived: boolean;
}

const SELECT = {
  id: true,
  scope: true,
  productId: true,
  categoryId: true,
  questionEn: true,
  questionBn: true,
  answerEn: true,
  answerBn: true,
  sortOrder: true,
  isActive: true,
  sourceQuestionId: true,
  archivedAt: true,
} as const;
type Row = {
  id: string;
  scope: FaqScopeKey;
  productId: string | null;
  categoryId: string | null;
  questionEn: string;
  questionBn: string | null;
  answerEn: string;
  answerBn: string | null;
  sortOrder: number;
  isActive: boolean;
  sourceQuestionId: string | null;
  archivedAt: Date | null;
};
const view = (r: Row): FaqView => ({
  id: r.id,
  scope: r.scope,
  productId: r.productId,
  categoryId: r.categoryId,
  questionEn: r.questionEn,
  questionBn: r.questionBn,
  answerEn: r.answerEn,
  answerBn: r.answerBn,
  sortOrder: r.sortOrder,
  isActive: r.isActive,
  sourceQuestionId: r.sourceQuestionId,
  archived: r.archivedAt !== null,
});

const text = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) => z.string().trim().max(max).nullish();

export const faqCreateSchema = z
  .object({
    scope: z.enum(FAQ_SCOPES),
    productId: z.uuid().nullish(),
    categoryId: z.uuid().nullish(),
    questionEn: text(300),
    answerEn: text(2000),
    questionBn: opt(300),
    answerBn: opt(2000),
    sortOrder: z.int().min(0).max(9999).nullish(),
  })
  .strict();

export const faqPatchSchema = z
  .object({
    questionEn: text(300).optional(),
    answerEn: text(2000).optional(),
    questionBn: opt(300),
    answerBn: opt(2000),
    sortOrder: z.int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const faqFromQuestionSchema = z.object({ scope: z.enum(FAQ_SCOPES) }).strict();

export const faqListSchema = z
  .object({ scope: z.enum(FAQ_SCOPES).nullish(), productId: z.uuid().nullish(), categoryId: z.uuid().nullish(), archived: z.boolean().nullish() })
  .strict();

async function target(
  deps: CatalogueDeps,
  who: Who,
  scope: FaqScopeKey,
  productId?: string | null,
  categoryId?: string | null,
): Promise<{ productId: string | null; categoryId: string | null }> {
  if (scope === 'SHOP') {
    if (productId || categoryId) throw new CatalogueError('INVALID_INPUT', 'a shop-wide question has no product or category', ['scope']);
    return { productId: null, categoryId: null };
  }
  if (scope === 'PRODUCT') {
    if (!productId || categoryId) throw new CatalogueError('INVALID_INPUT', 'a product question needs a product only', ['productId']);
    found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
    return { productId, categoryId: null };
  }
  if (!categoryId || productId) throw new CatalogueError('INVALID_INPUT', 'a category question needs a category only', ['categoryId']);
  found(await deps.db.category.findFirst({ where: { id: categoryId, storeId: who.storeId }, select: { id: true } }), 'category');
  return { productId: null, categoryId };
}

export async function listFaqs(deps: CatalogueDeps, who: Who, input: unknown = {}): Promise<FaqView[]> {
  await allow(deps, who, 'catalogue.read');
  const f = parse(faqListSchema, input, 'FAQ list');
  const rows = await deps.db.productFaq.findMany({
    where: {
      storeId: who.storeId,
      ...(f.scope ? { scope: f.scope } : {}),
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      archivedAt: f.archived ? { not: null } : null,
    },
    select: SELECT,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return (rows as Row[]).map(view);
}

export async function createFaq(deps: CatalogueDeps, who: Who, input: unknown): Promise<FaqView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(faqCreateSchema, input, 'FAQ');
  const t = await target(deps, who, d.scope, d.productId, d.categoryId);
  return deps.db.$transaction(async (tx) => {
    const row = (await tx.productFaq.create({
      data: {
        storeId: who.storeId,
        scope: d.scope,
        ...t,
        questionEn: d.questionEn,
        answerEn: d.answerEn,
        questionBn: d.questionBn || null,
        answerBn: d.answerBn || null,
        sortOrder: d.sortOrder ?? 0,
      },
      select: SELECT,
    })) as Row;
    await logChange(tx, who, 'faq.create', 'ProductFaq', row.id, null, { scope: row.scope, productId: row.productId, categoryId: row.categoryId });
    return view(row);
  });
}

export async function updateFaq(deps: CatalogueDeps, who: Who, id: string, input: unknown): Promise<FaqView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(faqPatchSchema, input, 'FAQ change');
  const cur = found((await deps.db.productFaq.findFirst({ where: { id, storeId: who.storeId, archivedAt: null }, select: SELECT })) as Row | null, 'FAQ');
  const data = {
    ...(d.questionEn !== undefined ? { questionEn: d.questionEn } : {}),
    ...(d.answerEn !== undefined ? { answerEn: d.answerEn } : {}),
    ...(d.questionBn !== undefined ? { questionBn: d.questionBn || null } : {}),
    ...(d.answerBn !== undefined ? { answerBn: d.answerBn || null } : {}),
    ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
    ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
  };
  return deps.db.$transaction(async (tx) => {
    const row = (await tx.productFaq.update({ where: { id }, data, select: SELECT })) as Row;
    await logChange(tx, who, 'faq.update', 'ProductFaq', id, cur, row);
    return view(row);
  });
}

/** Archives a FAQ (it stays in the database; the shop stops showing it). */
export async function archiveFaq(deps: CatalogueDeps, who: Who, id: string, archive = true): Promise<void> {
  await allow(deps, who, 'catalogue.write');
  const cur = found((await deps.db.productFaq.findFirst({ where: { id, storeId: who.storeId }, select: SELECT })) as Row | null, 'FAQ');
  const at = archive ? (deps.now?.() ?? new Date()) : null;
  await deps.db.$transaction(async (tx) => {
    await tx.productFaq.update({ where: { id }, data: { archivedAt: at } });
    await logChange(tx, who, archive ? 'faq.archive' : 'faq.unarchive', 'ProductFaq', id, cur, { archivedAt: at?.toISOString() ?? null });
  });
}

/**
 * "Make this an FAQ": copies an answered, published customer question and its answer into a FAQ on the same product,
 * on every product of its category, or shop-wide. The customer question stays as it is. Once per place.
 */
export async function makeFaqFromQuestion(deps: CatalogueDeps, who: Who, questionId: string, input: unknown): Promise<FaqView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(faqFromQuestionSchema, input, 'FAQ source');
  const q = found(
    await deps.db.productQuestion.findFirst({
      where: { id: questionId, storeId: who.storeId },
      select: { id: true, productId: true, question: true, answer: true, status: true, archivedAt: true },
    }),
    'question',
  );
  if (!q.answer?.trim() || q.status !== 'APPROVED' || q.archivedAt)
    throw new CatalogueError('CONFLICT', 'only an answered, published question can become an FAQ', ['NOT_PUBLISHED']);
  let categoryId: string | null = null;
  if (d.scope === 'CATEGORY') {
    const p = found(await deps.db.product.findFirst({ where: { id: q.productId, storeId: who.storeId }, select: { categoryId: true } }), 'product');
    if (!p.categoryId) throw new CatalogueError('CONFLICT', 'the product has no category', ['NO_CATEGORY']);
    categoryId = p.categoryId;
  }
  const dup = await deps.db.productFaq.findFirst({
    where: {
      storeId: who.storeId,
      sourceQuestionId: q.id,
      scope: d.scope,
      archivedAt: null,
      ...(d.scope === 'PRODUCT' ? { productId: q.productId } : {}),
      ...(d.scope === 'CATEGORY' ? { categoryId } : {}),
    },
    select: { id: true },
  });
  if (dup) throw new CatalogueError('CONFLICT', 'this question is already an FAQ there', ['ALREADY']);
  return deps.db.$transaction(async (tx) => {
    const row = (await tx.productFaq.create({
      data: {
        storeId: who.storeId,
        scope: d.scope,
        productId: d.scope === 'PRODUCT' ? q.productId : null,
        categoryId,
        questionEn: q.question.trim(),
        answerEn: q.answer!.trim(),
        sourceQuestionId: q.id,
      },
      select: SELECT,
    })) as Row;
    await logChange(tx, who, 'faq.fromQuestion', 'ProductFaq', row.id, null, { questionId: q.id, scope: row.scope });
    return view(row);
  });
}
