// S02 · PR 66 follow-up 184 — product questions for staff: the queue the customers' questions wait in, the shop's
// answer, and the check (publish, hide, back to the queue, archive, bring back). The table and its states came with
// PR 66 (`ProductQuestion`, the review states); the product page shows a question only once it is APPROVED, answered
// and not archived (apps/web lib/shop/pdp-qa-load), so nothing here can put an unanswered question on the shop:
// publishing needs an answer, and taking the answer away is not offered.
//
// Reading needs `reviews.read`; answering and every move need `reviews.moderate` (the same keys as the reviews,
// PR 65: questions and reviews are one desk). Nothing is deleted (hard rule 3): "archive" sets `archivedAt`, and
// "bring back" clears it and puts the question back in the queue to be checked again. Every change is audited.
import { z } from 'zod';
import { CatalogueError } from './errors';
import { allow, found, logChange, parse, type CatalogueDeps, type Who } from './context';

/** The four lists of the questions screen. */
export const QUESTION_VIEWS = ['open', 'published', 'hidden', 'archived'] as const;
export type QuestionView = (typeof QUESTION_VIEWS)[number];

export const QUESTION_ACTIONS = ['publish', 'hide', 'restore', 'archive', 'unarchive'] as const;
export type QuestionAction = (typeof QUESTION_ACTIONS)[number];

type QState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';

/** How long an answer may be (the product page shows it whole). */
export const ANSWER_MAX = 1000;
const PAGE = 30;

export const questionListSchema = z
  .object({
    view: z.enum(QUESTION_VIEWS).default('open'),
    productId: z.uuid().nullish(),
    limit: z.int().min(1).max(200).nullish(),
    cursor: z.uuid().nullish(),
  })
  .strict();

export const answerSchema = z
  .object({
    answer: z.string().trim().min(1).max(ANSWER_MAX),
    /** Publish it in the same step (the usual case). */
    publish: z.boolean().default(false),
  })
  .strict();

export const questionMoveSchema = z.object({ action: z.enum(QUESTION_ACTIONS) }).strict();

export interface QuestionRecord {
  id: string;
  productId: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  status: QState;
  archived: boolean;
  /** Asked from a signed-in account (the asker himself is never shown, not even here). */
  fromAccount: boolean;
  createdAt: string;
}

export interface QuestionList {
  questions: QuestionRecord[];
  nextCursor: string | null;
  counts: Record<QuestionView, number> & { unanswered: number };
}

const SELECT = { id: true, productId: true, customerId: true, question: true, answer: true, answeredAt: true, status: true, archivedAt: true, createdAt: true } as const;

type Row = { id: string; productId: string; customerId: string | null; question: string; answer: string | null; answeredAt: Date | null; status: string; archivedAt: Date | null; createdAt: Date };

const stateOf = (s: string): QState => (s === 'APPROVED' || s === 'REJECTED' || s === 'HIDDEN' ? s : 'PENDING');

const view = (r: Row): QuestionRecord => ({
  id: r.id,
  productId: r.productId,
  question: r.question,
  answer: r.answer,
  answeredAt: r.answeredAt?.toISOString() ?? null,
  status: stateOf(r.status),
  archived: r.archivedAt !== null,
  fromAccount: r.customerId !== null,
  createdAt: r.createdAt.toISOString(),
});

/** The rows of one list (the screen's views). */
export function whereOfView(storeId: number, v: QuestionView) {
  if (v === 'archived') return { storeId, archivedAt: { not: null } };
  const status = v === 'open' ? { status: 'PENDING' as const } : v === 'published' ? { status: 'APPROVED' as const } : { status: { in: ['HIDDEN' as const, 'REJECTED' as const] } };
  return { storeId, archivedAt: null, ...status };
}

/** What a move makes of a question (null: the move is refused, with why). */
export function moveOf(q: { status: QState; archived: boolean; answer: string | null }, action: QuestionAction): { status: QState; archive: boolean | null } | { refused: string } {
  if (action === 'unarchive') return q.archived ? { status: 'PENDING', archive: false } : { refused: 'NOT_ARCHIVED' };
  if (q.archived) return { refused: 'ARCHIVED' };
  if (action === 'archive') return { status: q.status, archive: true };
  if (action === 'publish') return q.answer && q.answer.trim() ? { status: 'APPROVED', archive: null } : { refused: 'NO_ANSWER' };
  if (action === 'hide') return { status: 'HIDDEN', archive: null };
  return { status: 'PENDING', archive: null };
}

export async function listQuestions(deps: CatalogueDeps, who: Who, query: unknown = {}): Promise<QuestionList> {
  await allow(deps, who, 'reviews.read');
  const q = parse(questionListSchema, query, 'question list query');
  const take = q.limit ?? PAGE;
  const where = { ...whereOfView(who.storeId, q.view), ...(q.productId ? { productId: q.productId } : {}) };
  const count = (v: QuestionView) => deps.db.productQuestion.count({ where: whereOfView(who.storeId, v) });
  const [rows, open, published, hidden, archived, unanswered] = await Promise.all([
    deps.db.productQuestion.findMany({ where, select: SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) }),
    count('open'),
    count('published'),
    count('hidden'),
    count('archived'),
    deps.db.productQuestion.count({ where: { ...whereOfView(who.storeId, 'open'), answer: null } }),
  ]);
  const page = rows.slice(0, take) as Row[];
  return { questions: page.map(view), nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null, counts: { open, published, hidden, archived, unanswered } };
}

async function one(deps: CatalogueDeps, who: Who, id: string): Promise<Row> {
  return found((await deps.db.productQuestion.findFirst({ where: { id, storeId: who.storeId }, select: SELECT })) as Row | null, 'question');
}

/** The shop's answer (written or changed), and with `publish` it goes on the product page in the same step. */
export async function answerQuestion(deps: CatalogueDeps, who: Who, id: string, input: unknown): Promise<QuestionRecord> {
  await allow(deps, who, 'reviews.moderate');
  const d = parse(answerSchema, input, 'answer');
  const before = await one(deps, who, id);
  if (before.archivedAt) throw new CatalogueError('CONFLICT', 'this question is archived');
  const now = deps.now?.() ?? new Date();
  const status: QState = d.publish ? 'APPROVED' : stateOf(before.status);
  return deps.db.$transaction(async (tx) => {
    const after = (await tx.productQuestion.update({ where: { id: before.id }, data: { answer: d.answer, answeredById: who.actor.staffUserId, answeredAt: now, status }, select: SELECT })) as Row;
    await logChange(tx, who, 'questions.answer', 'ProductQuestion', before.id, { answer: before.answer, status: before.status }, { answer: d.answer, status });
    return view(after);
  });
}

/** Publish (needs an answer), hide, back to the queue, archive, bring back — never a delete. */
export async function moveQuestion(deps: CatalogueDeps, who: Who, id: string, input: unknown): Promise<QuestionRecord> {
  await allow(deps, who, 'reviews.moderate');
  const d = parse(questionMoveSchema, input, 'question move');
  const before = await one(deps, who, id);
  const m = moveOf({ status: stateOf(before.status), archived: before.archivedAt !== null, answer: before.answer }, d.action);
  if ('refused' in m) throw new CatalogueError('CONFLICT', m.refused === 'NO_ANSWER' ? 'answer the question before publishing it' : m.refused === 'ARCHIVED' ? 'this question is archived' : 'this question is not archived', [m.refused]);
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const after = (await tx.productQuestion.update({
      where: { id: before.id },
      data: { status: m.status, ...(m.archive === true ? { archivedAt: now } : m.archive === false ? { archivedAt: null } : {}) },
      select: SELECT,
    })) as Row;
    await logChange(tx, who, `questions.${d.action}`, 'ProductQuestion', before.id, { status: before.status, archivedAt: before.archivedAt?.toISOString() ?? null }, { status: m.status, archived: after.archivedAt !== null });
    return view(after);
  });
}
