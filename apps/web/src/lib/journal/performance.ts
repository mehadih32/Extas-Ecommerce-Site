// S12 · PR 250 (register "Content performance report: which articles bring traffic and which bring orders"; Blueprint
// C11 "the blog as the traffic engine") — Website › Blog & journal › Performance on the database.
//
// - Counting (`blog.performance.count`, off as it ships): a live article page tells /api/shop/journal-read that it was
//   opened (`recordRead`): each browser once a shop day, split by where it came from (performance-model.ts
//   `readOrigin`: the SEO organic list's sites, the shop's own pages, anything else). The browser keeps the shop's own
//   read cookie — article ids and times only, for `windowDays`.
// - When an order lands (lib/shop/checkout-api.ts), `creditOrder` writes BlogOrderRead for the articles that browser
//   read in the window before it (`credit`: the last one, or every one). It never fails, holds or changes the order.
// - The report (`performanceReport`): each article's readers in the period by origin, and the orders that read it —
//   Ordered value (placed in the period) beside Sales (delivered in the period, delivered orders only) — through
//   @extas/metrics `kpiByArticle` / `kpiFromArticles`, never added up here; the shop's own `kpi` for the share.
// - Seeing needs `blog.read`; the money figures `reports.read` (without it, order counts only); the card `blog.publish`.
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { kpi, kpiByArticle, kpiFromArticles, lastDays, NO_ORDERS, type Kpi } from '@extas/metrics';
import { ymdIn } from '@extas/metrics/pure';
import { blogPerformanceSchema, storeTarget, type BlogPerformanceSettings, type Key, type Value } from '@extas/settings';
import { bagCookie } from '../shop/bag-model';
import { body, fail, guardAdmin, isUuid, json, readCookie, sameOrigin, type AdminDeps } from '../admin-auth';
import { JournalError, LIST_MAX, answer, versionOf, type JournalWho } from './journal';
import { isLive, issuesOf } from './model';
import { addRead, articleRows, creditedReads, parseReads, readOrigin, readToday, READ_COOKIE, serializeReads, type ArticleRow, type ArticleTraffic, type Figure } from './performance-model';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
/** What the shop side reads its settings with (the cart's and the checkout's reader fit). */
export interface Reader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/** The beacon's body is tiny; anything bigger is refused before it is read. */
const READ_BODY_MAX = 2048; // hardcode-ok: a request size limit, not a business number
const COLUMN = { search: 'fromSearch', shop: 'fromShop', other: 'fromOther' } as const;

/**
 * One reader opened a live article: counted once a shop day per browser while counting is on. Returns the read cookie
 * to set (null: nothing counted, the cookie stays as it was).
 */
export async function recordRead(db: Db, settings: Reader, input: { storeId: number; postId: string; from: unknown; cookie: string | null; now: Date }): Promise<string | null> {
  const at = { storeId: input.storeId };
  const s = await settings.value('blog.performance', at);
  if (!s.count) return null;
  const post = await db.blogPost.findFirst({ where: { id: input.postId, storeId: input.storeId }, select: { id: true, status: true, scheduledAt: true, archivedAt: true } });
  if (!post || !isLive(post, input.now)) return null;
  const [timeZone, organic] = await Promise.all([settings.value('store.timeZone', at), settings.value('seo.organic', at)]);
  const reads = parseReads(input.cookie);
  const cookie = bagCookie(READ_COOKIE, serializeReads(addRead(reads, post.id, input.now.getTime())), s.windowDays);
  if (readToday(reads, post.id, input.now, timeZone)) return cookie;
  const day = new Date(`${ymdIn(input.now, timeZone)}T00:00:00Z`);
  const col = COLUMN[readOrigin(input.from, organic.sources)];
  const where = { postId_day: { postId: post.id, day } };
  const update = { readers: { increment: 1 }, [col]: { increment: 1 } };
  try {
    await db.blogPostDailyStat.upsert({ where, create: { storeId: input.storeId, postId: post.id, day, readers: 1, [col]: 1 }, update });
  } catch (e) {
    // two first readers of the day at once: the other one made the row
    if (!isUnique(e)) throw e;
    await db.blogPostDailyStat.update({ where, data: update });
  }
  return cookie;
}

/** The order credits the articles its browser read in the window before it (written once; never fails the order). */
export async function creditOrder(db: Db, settings: Reader, input: { storeId: number; orderId: string; cookie: string | null }): Promise<number> {
  try {
    const s = await settings.value('blog.performance', { storeId: input.storeId });
    if (!s.count) return 0;
    const reads = parseReads(input.cookie);
    if (!reads.length) return 0;
    const order = await db.order.findFirst({ where: { id: input.orderId, storeId: input.storeId }, select: { placedAt: true } });
    if (!order) return 0;
    const credited = creditedReads(reads, order.placedAt, s);
    if (!credited.length) return 0;
    const known = await db.blogPost.findMany({ where: { storeId: input.storeId, id: { in: credited.map((r) => r.postId) } }, select: { id: true } });
    const ids = new Set(known.map((p) => p.id));
    const rows = credited.filter((r) => ids.has(r.postId)).map((r) => ({ storeId: input.storeId, orderId: input.orderId, postId: r.postId, readAt: new Date(r.at) }));
    if (!rows.length) return 0;
    return (await db.blogOrderRead.createMany({ data: rows, skipDuplicates: true })).count;
  } catch (e) {
    console.warn(`article credit: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    return 0;
  }
}

/** POST /api/shop/journal-read {postId, from} — the article page's beacon (same site only; always a quiet 204). */
export async function readHandler(request: Request, deps: { db: Db; settings: Reader; storeId: number; now?: () => Date } | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  if (Number(request.headers.get('content-length') ?? '0') > READ_BODY_MAX) return fail(413, 'TOO_LARGE');
  try {
    const b = await body(request);
    if (typeof b.postId !== 'string' || !isUuid(b.postId)) return fail(400, 'INVALID_INPUT', ['postId']);
    const cookie = await recordRead(deps.db, deps.settings, { storeId: deps.storeId, postId: b.postId, from: b.from, cookie: readCookie(request, READ_COOKIE), now: deps.now?.() ?? new Date() });
    return new Response(null, { status: 204, headers: cookie ? { 'set-cookie': cookie, 'cache-control': 'no-store' } : { 'cache-control': 'no-store' } });
  } catch (e) {
    console.warn(`article read: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }
}

export interface PerformanceScreen {
  timeZone: string;
  from: string;
  to: string;
  days: number;
  rows: ArticleRow[];
  totals: ArticleTraffic;
  /** Every order that read an article, each once, and the shop's own figures for the share. */
  fromArticles: Kpi;
  shop: Kpi;
  card: { key: string; value: BlogPerformanceSettings; version: string };
}

const fig = (f: { orders: number; valueMinor: number }): Figure => ({ orders: f.orders, valueMinor: f.valueMinor });

/** The report over the last `days` shop days (the card's `days` when not given). */
export async function performanceReport(db: Db, resolver: Resolver, now: Date, opts: { days?: number | null } = {}, storeId: number = S): Promise<PerformanceScreen> {
  const at = { storeId };
  const [value, timeZone] = await Promise.all([resolver.value('blog.performance', at), resolver.value('store.timeZone', at)]);
  const days = opts.days && Number.isInteger(opts.days) && opts.days >= 1 && opts.days <= 365 ? opts.days : value.days;
  const span = lastDays(days, now, timeZone);
  const [stats, byArticle, fromArticles, shop] = await Promise.all([
    db.blogPostDailyStat.groupBy({
      by: ['postId'],
      where: { storeId, day: { gte: new Date(`${span.from}T00:00:00Z`), lte: new Date(`${span.to}T00:00:00Z`) } },
      _sum: { readers: true, fromSearch: true, fromShop: true, fromOther: true },
    }),
    kpiByArticle(db, storeId, span.period),
    kpiFromArticles(db, storeId, span.period),
    kpi(db, storeId, span.period),
  ]);
  const traffic = new Map<string, ArticleTraffic>(stats.map((r) => [r.postId, { readers: r._sum.readers ?? 0, fromSearch: r._sum.fromSearch ?? 0, fromShop: r._sum.fromShop ?? 0, fromOther: r._sum.fromOther ?? 0 }]));
  const money = new Map(byArticle.map((r) => [r.key, { ordered: fig(r.ordered), sales: fig(r.sales) }]));
  const touched = [...new Set([...traffic.keys(), ...money.keys()])];
  const posts = await db.blogPost.findMany({
    where: { storeId, OR: [{ id: { in: touched } }, { status: { in: ['PUBLISHED', 'SCHEDULED'] }, archivedAt: null }] },
    select: { id: true, title: true, locale: true, status: true, scheduledAt: true, archivedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: LIST_MAX,
  });
  const rows = articleRows(
    posts.map((p) => ({ id: p.id, title: p.title, locale: p.locale, live: isLive(p, now) })),
    traffic,
    money,
  );
  const totals = [...traffic.values()].reduce<ArticleTraffic>((t, r) => ({ readers: t.readers + r.readers, fromSearch: t.fromSearch + r.fromSearch, fromShop: t.fromShop + r.fromShop, fromOther: t.fromOther + r.fromOther }), { readers: 0, fromSearch: 0, fromShop: 0, fromOther: 0 });
  return { timeZone, from: span.from, to: span.to, days, rows, totals, fromArticles, shop, card: { key: 'blog.performance', value, version: versionOf(value) } };
}

/** The report's card (`blog.publish`; audited). */
export async function savePerformanceSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'blog.performance') throw new JournalError('INVALID_INPUT', 400, ['key']);
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const before = await resolver.value('blog.performance', { storeId });
  if (o.version !== versionOf(before)) throw new JournalError('STALE', 409);
  const ok = blogPerformanceSchema.safeParse(o.value);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set('blog.performance', ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Performance' });
  await audit(db, who.actor, { storeId, action: 'blog.performance.settings', entityType: 'Setting', entityId: 'blog.performance', before: { ...before }, after: { ...ok.data } }, who.ctx);
}

/**
 * /api/admin/blog/performance — GET the report (`blog.read`; ?days=1–365); PUT the card (`blog.publish`). Money
 * figures only for `reports.read` (otherwise the order counts). Every answer carries the report.
 */
export async function performanceHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const resolver = deps!.resolver;
  const now = deps!.now?.() ?? new Date();
  try {
    if (method === 'PUT') await savePerformanceSettings(db, resolver, { actor: g.actor, ctx: g.ctx }, await body(request));
    const days = Number(new URL(request.url).searchParams.get('days'));
    const report = await performanceReport(db, resolver, now, { days: Number.isInteger(days) ? days : null });
    const money = await can(db, g.actor, 'reports.read', { storeId: S });
    return json({ ok: true, report: money ? report : withoutMoney(report), cards: { [report.card.key]: report.card } });
  } catch (e) {
    return answer(e);
  }
}

/** The report with order counts only (no Ordered value or Sales amounts) for a viewer without `reports.read`. */
export function withoutMoney(r: PerformanceScreen): PerformanceScreen {
  const k = (x: Kpi): Kpi => ({ sales: { ...NO_ORDERS, orders: x.sales.orders }, ordered: { ...NO_ORDERS, orders: x.ordered.orders } });
  return { ...r, rows: r.rows.map((x) => ({ ...x, ordered: { ...x.ordered, valueMinor: 0 }, sales: { ...x.sales, valueMinor: 0 } })), fromArticles: k(r.fromArticles), shop: k(r.shop) };
}
