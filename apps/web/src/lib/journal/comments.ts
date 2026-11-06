// S12 · PR 251 (register "Comment handling, or the decision to run without comments"; BACKEND-ARCHITECTURE WEB-03 "More
// options: … comments") — readers' comments under a journal article, on the database.
//
// - `blog.comments` off (as shipped) is the decision to run without comments: the article page draws no comment part
//   and /api/shop/journal-comment answers COMMENTS_OFF. On: a reader leaves a comment on a live article (signed in only
//   as shipped, or anyone with a name), at most `maxChars` characters and `perDay` in the last 24 hours (a customer by
//   his account, a guest by his hashed address); the same words twice are one comment. It is saved waiting (PENDING)
//   and the answer says so: nothing a reader writes is shown before a person presses Show.
// - Website › Blog & journal › Comments: the waiting queue (Show, Undo), every comment by chip (waiting, shown, hidden)
//   with Show and Hide for the ticked ones, and the card. Seeing needs `blog.read`; Show, Hide and the card
//   `blog.publish`. Every change is audited and keeps the status it replaced, so Undo puts it back. Nothing is deleted.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { blogCommentsSchema, storeTarget, type BlogCommentsSettings } from '@extas/settings';
import { body as readBody, fail, guardAdmin, isUuid, json, requestContext, sameOrigin, type AdminDeps } from '../admin-auth';
import { JournalError, LIST_MAX, answer, versionOf, type JournalWho } from './journal';
import { cleanBody, cleanName, COMMENT_MOVES, moved, type CommentMove, type CommentState } from './comments-model';
import { isLive, issuesOf } from './model';
import type { Reader } from './performance';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
const DAY = 86_400_000;
/** A comment's request is small; anything bigger is refused before it is read. */
export const COMMENT_BODY_MAX = 16_384; // hardcode-ok: a request size limit, not a business number
/** How many ids one press may change. */
const IDS_MAX = 200; // hardcode-ok: a list length, not a business number

/** A guest's address, hashed with the store (kept only to count his day's comments). */
const hashOf = (storeId: number, ip: string | null) => (ip ? createHash('sha256').update(`blog-comment:${storeId}:${ip}`).digest('hex').slice(0, 32) : null);

export interface ShownComment {
  id: string;
  name: string | null;
  body: string;
  at: Date;
}

/** The shown comments of one article, newest first, at most `take`. */
export async function shownComments(db: Db, storeId: number, postId: string, take: number): Promise<ShownComment[]> {
  const rows = await db.blogComment.findMany({ where: { storeId, postId, status: 'APPROVED', archivedAt: null }, orderBy: { createdAt: 'desc' }, take, select: { id: true, name: true, body: true, createdAt: true } });
  return rows.map((r) => ({ id: r.id, name: r.name, body: r.body, at: r.createdAt }));
}

export interface CommentInput {
  storeId: number;
  postId: unknown;
  body: unknown;
  name?: unknown;
  customer: { id: string; name: string | null } | null;
  ip: string | null;
  now: Date;
}

/** A reader's comment, saved waiting for a person; `again` when the same words were already sent today. */
export async function postComment(db: Db, settings: Reader, input: CommentInput): Promise<{ id: string; status: 'PENDING'; again: boolean }> {
  const s = await settings.value('blog.comments', { storeId: input.storeId });
  if (!s.on) throw new JournalError('COMMENTS_OFF', 403);
  if (typeof input.postId !== 'string' || !isUuid(input.postId)) throw new JournalError('INVALID_INPUT', 400, ['postId']);
  const post = await db.blogPost.findFirst({ where: { id: input.postId, storeId: input.storeId }, select: { id: true, status: true, scheduledAt: true, archivedAt: true } });
  if (!post || !isLive(post, input.now)) throw new JournalError('NOT_FOUND', 404);
  if (!input.customer && s.who === 'signedIn') throw new JournalError('SIGNED_OUT', 401);
  const text = cleanBody(input.body, s.maxChars);
  const name = input.customer ? cleanName(input.customer.name) : cleanName(input.name);
  const bad = [...(text ? [] : ['body']), ...(!input.customer && !name ? ['name'] : [])];
  if (bad.length) throw new JournalError('INVALID_INPUT', 400, bad);
  const fromHash = input.customer ? null : hashOf(input.storeId, input.ip);
  const who = input.customer ? { customerId: input.customer.id } : fromHash ? { fromHash } : null;
  if (!who) throw new JournalError('SIGNED_OUT', 401);
  const since = new Date(input.now.getTime() - DAY);
  const today = await db.blogComment.findMany({ where: { storeId: input.storeId, ...who, createdAt: { gte: since } }, select: { id: true, postId: true, body: true } });
  const same = today.find((r) => r.postId === post.id && r.body === text);
  if (same) return { id: same.id, status: 'PENDING', again: true };
  if (today.length >= s.perDay) throw new JournalError('DAY_LIMIT', 429);
  const row = await db.blogComment.create({ data: { storeId: input.storeId, postId: post.id, customerId: input.customer?.id ?? null, fromHash, name, body: text!, status: 'PENDING' }, select: { id: true } });
  return { id: row.id, status: 'PENDING', again: false };
}

export interface CommentRow {
  id: string;
  status: CommentState;
  name: string | null;
  body: string;
  createdAt: Date;
  decidedAt: Date | null;
  /** Signed in when he wrote it (else a guest). */
  customer: boolean;
  post: { id: string; title: string; slug: string; locale: string; live: boolean } | null;
}

export interface CommentsScreen {
  counts: Record<'waiting' | 'shown' | 'hidden', number>;
  rows: CommentRow[];
  card: { key: 'blog.comments'; value: BlogCommentsSettings; version: string };
}

/** Website › Blog & journal › Comments: every comment (newest first, at most LIST_MAX), the counts and the card. */
export async function commentsScreen(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<CommentsScreen> {
  const [value, grouped, list] = await Promise.all([
    resolver.value('blog.comments', { storeId }),
    db.blogComment.groupBy({ by: ['status'], where: { storeId, archivedAt: null }, _count: { _all: true } }),
    db.blogComment.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: LIST_MAX, select: { id: true, status: true, name: true, body: true, createdAt: true, decidedAt: true, customerId: true, postId: true } }),
  ]);
  const postIds = [...new Set(list.map((r) => r.postId))];
  const posts = postIds.length ? await db.blogPost.findMany({ where: { id: { in: postIds }, storeId }, select: { id: true, title: true, slug: true, locale: true, status: true, scheduledAt: true, archivedAt: true } }) : [];
  const byId = new Map(posts.map((p) => [p.id, p]));
  const counts = { waiting: 0, shown: 0, hidden: 0 };
  for (const g of grouped) {
    const k = g.status === 'PENDING' ? 'waiting' : g.status === 'APPROVED' ? 'shown' : 'hidden';
    counts[k] += g._count._all;
  }
  return {
    counts,
    rows: list.map((r) => {
      const p = byId.get(r.postId);
      return {
        id: r.id,
        status: (r.status === 'REJECTED' ? 'HIDDEN' : r.status) as CommentState,
        name: r.name,
        body: r.body,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        customer: !!r.customerId,
        post: p ? { id: p.id, title: p.title, slug: p.slug, locale: p.locale, live: isLive(p, now) } : null,
      };
    }),
    card: { key: 'blog.comments', value, version: versionOf(value) },
  };
}

/** Show, hide, or put back the ticked comments (`blog.publish`); returns how many changed. */
export async function moveComments(db: Db, who: JournalWho, input: unknown, now: Date = new Date(), storeId: number = S): Promise<number> {
  const o = (input ?? {}) as { ids?: unknown; to?: unknown };
  const ids = Array.isArray(o.ids) ? [...new Set(o.ids.filter((x): x is string => typeof x === 'string' && isUuid(x)))] : [];
  if (!ids.length || ids.length > IDS_MAX || (Array.isArray(o.ids) && ids.length !== new Set(o.ids).size)) throw new JournalError('INVALID_INPUT', 400, ['ids']);
  if (!(COMMENT_MOVES as readonly unknown[]).includes(o.to)) throw new JournalError('INVALID_INPUT', 400, ['to']);
  const to = o.to as CommentMove;
  const rows = await db.blogComment.findMany({ where: { id: { in: ids }, storeId, archivedAt: null }, select: { id: true, status: true, prevStatus: true } });
  if (rows.length !== ids.length) throw new JournalError('NOT_FOUND', 404);
  let changed = 0;
  for (const r of rows) {
    const cur = (r.status === 'REJECTED' ? 'HIDDEN' : r.status) as CommentState;
    const prev = r.prevStatus === 'REJECTED' ? 'HIDDEN' : (r.prevStatus as CommentState | null);
    const m = moved(cur, prev, to);
    if (!m) continue;
    const done = await db.blogComment.updateMany({ where: { id: r.id, status: r.status }, data: { status: m.status, prevStatus: m.prevStatus, decidedAt: now, decidedById: who.actor.staffUserId ?? null } });
    if (!done.count) continue;
    changed += 1;
    await audit(db, who.actor, { storeId, action: `blog.comment.${m.status.toLowerCase()}`, entityType: 'BlogComment', entityId: r.id, before: { status: cur }, after: { status: m.status } }, who.ctx);
  }
  return changed;
}

/** The card (`blog.publish`): the switch card's {key, on, values} or the whole value with its version. */
export async function saveCommentSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const before = await resolver.value('blog.comments', { storeId });
  const o = (input ?? {}) as { key?: unknown; on?: unknown; values?: unknown; value?: unknown; version?: unknown };
  let next: unknown;
  if (o.key === 'blog.comments' && typeof o.on === 'boolean') next = { ...before, ...((o.values && typeof o.values === 'object' ? o.values : {}) as object), on: o.on };
  else {
    if (typeof o.version !== 'string' || o.version !== versionOf(before)) throw new JournalError('STALE', 409);
    next = o.value;
  }
  const ok = blogCommentsSchema.safeParse(next);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set('blog.comments', ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Comments' });
  await audit(db, who.actor, { storeId, action: 'blog.comments.settings', entityType: 'Setting', entityId: 'blog.comments', before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/**
 * /api/admin/blog/comments — GET the page (`blog.read`); POST {ids, to: APPROVED | HIDDEN | back} (`blog.publish`);
 * PUT the card (`blog.publish`). Every answer carries the page.
 */
export async function commentsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (!['GET', 'POST', 'PUT'].includes(method)) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.publish', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const now = deps!.now?.() ?? new Date();
  try {
    const who = { actor: g.actor, ctx: g.ctx };
    let changed: number | undefined;
    if (method === 'POST') changed = await moveComments(db, who, await readBody(request), now);
    if (method === 'PUT') await saveCommentSettings(db, deps!.resolver, who, await readBody(request));
    const screen = await commentsScreen(db, deps!.resolver, now);
    return json({ ok: true, ...(changed === undefined ? {} : { changed }), screen });
  } catch (e) {
    return answer(e);
  }
}

export interface ShopCommentDeps {
  db: Db;
  settings: Reader;
  storeId: number;
  /** The signed-in customer of the request, or null. */
  customer(request: Request): Promise<{ id: string; name: string | null } | null>;
  now?: () => Date;
}

/** POST /api/shop/journal-comment {postId, body, name?} — a reader's comment, saved waiting (same site only). */
export async function shopCommentHandler(request: Request, deps: ShopCommentDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > COMMENT_BODY_MAX) return fail(413, 'TOO_LARGE');
  try {
    const b = (await readBody(request)) as { postId?: unknown; body?: unknown; name?: unknown };
    const customer = await deps.customer(request);
    const saved = await postComment(deps.db, deps.settings, { storeId: deps.storeId, postId: b.postId, body: b.body, name: b.name, customer, ip: requestContext(request).ip ?? null, now: deps.now?.() ?? new Date() });
    return json({ ok: true, ...saved }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return answer(e);
  }
}
