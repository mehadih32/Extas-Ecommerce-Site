// S02 · PR 65 — the staff side of product reviews. No admin screen in this PR (the moderation queue is built on the
// new 14-section admin shell, Products → Reviews); these are the routes it will call, and every one of them signs the
// person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), and
// then calls @extas/catalogue, which checks the permission again, scopes everything by store and writes the audit log.
//
//   GET   /api/admin/reviews                 the queue (?status, ?productId, ?withPhoto=1, ?rewarded=0, ?archived,
//                                            ?limit, ?cursor) with the counters · reviews.read
//   GET   /api/admin/reviews/:id             one review · reviews.read
//   POST  /api/admin/reviews                 the shop's own review {productId|comboId, rating, …} · reviews.write
//   POST  /api/admin/reviews/:id/moderate    {action: approve|hide|reject|restore, reason?} · reviews.moderate
//   POST  /api/admin/reviews/:id/verified    {verified: true|false} · reviews.moderate
//
// Approving a review is the only thing in the whole shop that pays the photo-review reward, and only while the owner
// has switched it on with his own amount (`reviews.photoReward`, off with no amount). The answer says what was paid.
import * as cat from '@extas/catalogue';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { storeIdOf } from './catalogue-api';

type Perm = 'reviews.read' | 'reviews.moderate' | 'reviews.write';

interface Ctx {
  deps: cat.CatalogueDeps;
  who: cat.Who;
  url: URL;
}

const method = (request: Request) => request.method.toUpperCase();
const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));

/** A yes/no in the address: `1`/`true` and `0`/`false`; anything else is "not asked". */
const flag = (url: URL, key: string): boolean | undefined => {
  const raw = url.searchParams.get(key);
  if (raw === null) return undefined;
  if (['1', 'true'].includes(raw)) return true;
  if (['0', 'false'].includes(raw)) return false;
  return undefined;
};

async function handle(request: Request, deps: AdminDeps | null, permission: Perm, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>): Promise<Response> {
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

/** GET/POST /api/admin/reviews · GET …/:id · POST …/:id/moderate · POST …/:id/verified. */
export function reviewsHandler(request: Request, deps: AdminDeps | null, path: string[] = []): Promise<Response> {
  const [id, action] = path;
  if (!id) {
    if (method(request) === 'GET') {
      return handle(request, deps, 'reviews.read', async (c) => {
        const productId = c.url.searchParams.get('productId');
        const cursor = c.url.searchParams.get('cursor');
        const status = c.url.searchParams.get('status');
        const archived = c.url.searchParams.get('archived');
        const limit = c.url.searchParams.get('limit');
        const bad = [
          ...(productId !== null && !isUuid(productId) ? ['productId'] : []),
          ...(cursor !== null && !isUuid(cursor) ? ['cursor'] : []),
          ...(status !== null && !(cat.REVIEW_STATUSES as readonly string[]).includes(status) ? ['status'] : []),
          ...(archived !== null && !['no', 'only', 'all'].includes(archived) ? ['archived'] : []),
          ...(limit !== null && !(Number.isInteger(Number(limit)) && Number(limit) > 0) ? ['limit'] : []),
        ];
        if (bad.length) return fail(400, 'INVALID_INPUT', bad);
        return {
          ...(await cat.listReviews(c.deps, c.who, {
            ...(status ? { status: status as cat.ReviewState } : {}),
            ...(productId ? { productId } : {}),
            ...(flag(c.url, 'withPhoto') === undefined ? {} : { withPhoto: flag(c.url, 'withPhoto') }),
            ...(flag(c.url, 'rewarded') === undefined ? {} : { rewarded: flag(c.url, 'rewarded') }),
            ...(archived ? { archived: archived as 'no' | 'only' | 'all' } : {}),
            ...(limit ? { limit: Number(limit) } : {}),
            ...(cursor ? { cursor } : {}),
          })),
        };
      });
    }
    if (method(request) !== 'POST') return notAllowed();
    return handle(request, deps, 'reviews.write', async (c) => ({ review: await cat.addStaffReview(c.deps, c.who, await body(request)) }));
  }
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['id']));
  if (!action) {
    if (method(request) !== 'GET') return notAllowed();
    return handle(request, deps, 'reviews.read', async (c) => ({ review: await cat.getReview(c.deps, c.who, id) }));
  }
  if (path.length > 2) return Promise.resolve(fail(404, 'not-found'));
  if (method(request) !== 'POST') return notAllowed();
  if (action === 'moderate') {
    return handle(request, deps, 'reviews.moderate', async (c) => {
      const r = await cat.moderateReview(c.deps, c.who, id, await body(request));
      return { review: r.review, reward: r.reward };
    });
  }
  if (action === 'verified') {
    return handle(request, deps, 'reviews.moderate', async (c) => {
      const b = await body(request);
      if (typeof b.verified !== 'boolean') return fail(400, 'INVALID_INPUT', ['verified']);
      return { review: await cat.setReviewVerified(c.deps, c.who, id, b.verified) };
    });
  }
  return Promise.resolve(fail(404, 'not-found'));
}
