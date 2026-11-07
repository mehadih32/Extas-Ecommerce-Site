// S02 · PR 66 follow-up 184 — the staff side of product questions (Products › Reviews › Questions). Every route signs
// the person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store)
// and calls @extas/catalogue, which checks it again, scopes by store and writes the audit log.
//
//   GET   /api/admin/questions               the list (?view=open|published|hidden|archived, ?productId, ?cursor) · reviews.read
//   POST  /api/admin/questions/:id/answer    {answer, publish?} · reviews.moderate
//   POST  /api/admin/questions/:id/move      {action: publish|hide|restore|archive|unarchive} · reviews.moderate
//
// Nothing is deleted: archive keeps the row, and publishing needs an answer (the catalogue refuses CONFLICT).
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { storeIdOf } from './catalogue-api';

type Perm = 'reviews.read' | 'reviews.moderate';

async function handle(request: Request, deps: AdminDeps | null, permission: Perm, fn: (c: { deps: cat.CatalogueDeps; who: cat.Who; url: URL }) => Promise<Record<string, unknown> | Response>): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const out = await fn({ deps: { db: deps!.db, settings: deps!.resolver, now: deps!.now }, who: { actor: g.actor, storeId, ctx: g.ctx }, url });
    return out instanceof Response ? out : json({ ok: true, ...out });
  } catch (e) {
    return errorResponse(e);
  }
}

export function questionsHandler(request: Request, deps: AdminDeps | null, path: string[] = []): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, action] = path;
  if (!id) {
    if (m !== 'GET') return Promise.resolve(fail(405, 'method-not-allowed'));
    return handle(request, deps, 'reviews.read', async (c) => {
      const view = c.url.searchParams.get('view');
      const productId = c.url.searchParams.get('productId');
      const cursor = c.url.searchParams.get('cursor');
      const bad = [
        ...(view !== null && !(cat.QUESTION_VIEWS as readonly string[]).includes(view) ? ['view'] : []),
        ...(productId !== null && !isUuid(productId) ? ['productId'] : []),
        ...(cursor !== null && !isUuid(cursor) ? ['cursor'] : []),
      ];
      if (bad.length) return fail(400, 'INVALID_INPUT', bad);
      return { ...(await cat.listQuestions(c.deps, c.who, { ...(view ? { view } : {}), ...(productId ? { productId } : {}), ...(cursor ? { cursor } : {}) })) };
    });
  }
  if (!isUuid(id) || path.length !== 2 || (action !== 'answer' && action !== 'move')) return Promise.resolve(fail(404, 'not-found'));
  if (m !== 'POST') return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(request, deps, 'reviews.moderate', async (c) => {
    const b = await body(request);
    return { question: action === 'answer' ? await cat.answerQuestion(c.deps, c.who, id, b) : await cat.moveQuestion(c.deps, c.who, id, b) };
  });
}
