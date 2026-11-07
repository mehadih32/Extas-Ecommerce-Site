// S02 · PR 66 follow-up 183 — "Ask a question" on the product page (public). While `pdp.qaAsk.on` (off as shipped),
// a customer's question about a live product is saved PENDING for the team (Products › Reviews › Questions, follow-up
// 184) and is never shown before it is answered and published (lib/shop/pdp-qa-load reads APPROVED and answered only).
// Limits: `who` (signed-in only as shipped, or anyone), the longest question, and `perDay` per person (his account, or
// a guest's address hashed with the store — kept only to count). The same words sent again the same day answer
// `again` and save nothing. The edge gate also counts every public POST against the per-address limit (follow-up 152).
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@extas/db/client';
import type { Key, Value } from '@extas/settings';
import { body as readBody, fail, isUuid, json, requestContext, sameOrigin } from '../admin-auth';
import { cleanBody } from '../journal/comments-model';

const DAY = 86_400_000;
/** A question's request is small; anything bigger is refused before it is read. */
export const QUESTION_BODY_MAX = 8_192; // hardcode-ok: a request size limit, not a business number

export interface Reader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

export class AskError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

/** A guest's address, hashed with the store (kept only to count his day's questions). */
export const askHashOf = (storeId: number, ip: string | null) => (ip ? createHash('sha256').update(`product-question:${storeId}:${ip}`).digest('hex').slice(0, 32) : null);

export interface AskInput {
  storeId: number;
  productId: unknown;
  question: unknown;
  customer: { id: string } | null;
  ip: string | null;
  now: Date;
}

/** The question, saved waiting for the team; `again` when the same words were already sent today. */
export async function askQuestion(db: PrismaClient, settings: Reader, input: AskInput): Promise<{ id: string; status: 'PENDING'; again: boolean }> {
  const s = await settings.value('pdp.qaAsk', { storeId: input.storeId });
  if (!s.on) throw new AskError('ASK_OFF', 403);
  if (typeof input.productId !== 'string' || !isUuid(input.productId)) throw new AskError('INVALID_INPUT', 400, ['productId']);
  const product = await db.product.findFirst({ where: { id: input.productId, storeId: input.storeId, status: 'PUBLISHED', archivedAt: null }, select: { id: true } });
  if (!product) throw new AskError('NOT_FOUND', 404);
  if (!input.customer && s.who === 'signedIn') throw new AskError('SIGNED_OUT', 401);
  const text = cleanBody(input.question, s.maxChars);
  if (!text) throw new AskError('INVALID_INPUT', 400, ['question']);
  const fromHash = input.customer ? null : askHashOf(input.storeId, input.ip);
  const who = input.customer ? { customerId: input.customer.id } : fromHash ? { fromHash } : null;
  if (!who) throw new AskError('SIGNED_OUT', 401);
  const today = await db.productQuestion.findMany({ where: { storeId: input.storeId, ...who, createdAt: { gte: new Date(input.now.getTime() - DAY) } }, select: { id: true, productId: true, question: true } });
  const same = today.find((r) => r.productId === product.id && r.question === text);
  if (same) return { id: same.id, status: 'PENDING', again: true };
  if (today.length >= s.perDay) throw new AskError('DAY_LIMIT', 429);
  const row = await db.productQuestion.create({ data: { storeId: input.storeId, productId: product.id, customerId: input.customer?.id ?? null, fromHash, question: text, status: 'PENDING' }, select: { id: true } });
  return { id: row.id, status: 'PENDING', again: false };
}

export interface AskDeps {
  db: PrismaClient;
  settings: Reader;
  storeId: number;
  customer(request: Request): Promise<{ id: string } | null>;
  now?: () => Date;
}

/** POST /api/shop/question {productId, question}. */
export async function askHandler(request: Request, deps: AskDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > QUESTION_BODY_MAX) return fail(413, 'TOO_LARGE');
  try {
    const b = (await readBody(request)) as { productId?: unknown; question?: unknown };
    const customer = await deps.customer(request);
    const saved = await askQuestion(deps.db, deps.settings, { storeId: deps.storeId, productId: b.productId, question: b.question, customer, ip: requestContext(request).ip ?? null, now: deps.now?.() ?? new Date() });
    return json({ ok: true, ...saved }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof AskError) return fail(e.status, e.code, e.details);
    throw e;
  }
}
