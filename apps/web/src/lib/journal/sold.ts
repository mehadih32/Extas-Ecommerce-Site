// S12 · PR 253 (register "Article-to-product attribution: what an article actually sold"; Blueprint C11 "the blog as the
// traffic engine") — Website › Blog & journal › What articles sold, on the database. For the last `blog.performance.days`
// shop days (or 7/30/90): each article, the products in the orders that read it (BlogOrderRead, written while
// `blog.performance.count` is on), with the pieces ordered (placed in the period) beside the pieces delivered and their
// Sales (delivered in the period, delivered orders only) — through @extas/metrics `linesByArticle`, never added up here
// across articles — and whether each product was in the article's own product block or bought besides.
// Seeing needs `blog.read`; the amounts `reports.read` (without it, pieces only). Read-only: nothing is changed here.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { lastDays, linesByArticle, type ArticleLineFigure } from '@extas/metrics';
import type { AdminDeps } from '../admin-auth';
import { isLive } from './model';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];

export interface SoldProduct {
  productId: string | null;
  name: { en: string; bn: string | null } | null;
  /** In the article's own product block (else bought besides). */
  inBlock: boolean;
  ordered: ArticleLineFigure;
  sales: ArticleLineFigure;
}

export interface SoldArticle {
  id: string;
  title: string;
  locale: string;
  live: boolean;
  products: SoldProduct[];
  /** This article's own sums (its products added up; never across articles). */
  piecesOrdered: number;
  piecesDelivered: number;
  salesMinor: number;
  fromBlock: number;
}

export interface SoldReport {
  timeZone: string;
  from: string;
  to: string;
  days: number;
  counting: boolean;
  credit: 'last' | 'every';
  articles: SoldArticle[];
  /** Different products sold from any article; articles that sold anything. */
  products: number;
}

/** The report over the last `days` shop days (the performance card's `days` when not given). */
export async function soldReport(db: Db, resolver: Resolver, now: Date, opts: { days?: number | null } = {}, storeId: number = S): Promise<SoldReport> {
  const at = { storeId };
  const [perf, timeZone] = await Promise.all([resolver.value('blog.performance', at), resolver.value('store.timeZone', at)]);
  const days = opts.days && Number.isInteger(opts.days) && opts.days >= 1 && opts.days <= 365 ? opts.days : perf.days;
  const span = lastDays(days, now, timeZone);
  const rows = await linesByArticle(db, storeId, span.period);
  const postIds = [...new Set(rows.map((r) => r.postId))];
  const productIds = [...new Set(rows.flatMap((r) => (r.productId ? [r.productId] : [])))];
  const [posts, products] = await Promise.all([
    postIds.length ? db.blogPost.findMany({ where: { storeId, id: { in: postIds } }, select: { id: true, title: true, locale: true, productIds: true, status: true, scheduledAt: true, archivedAt: true } }) : [],
    productIds.length ? db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, nameEn: true, nameBn: true } }) : [],
  ]);
  const postOf = new Map(posts.map((p) => [p.id, p]));
  const nameOf = new Map(products.map((p) => [p.id, { en: p.nameEn, bn: p.nameBn }]));
  const byPost = new Map<string, SoldProduct[]>();
  for (const r of rows) {
    const post = postOf.get(r.postId);
    if (!post) continue;
    const list = byPost.get(r.postId) ?? [];
    list.push({ productId: r.productId, name: r.productId ? (nameOf.get(r.productId) ?? null) : null, inBlock: !!r.productId && post.productIds.includes(r.productId), ordered: r.ordered, sales: r.sales });
    byPost.set(r.postId, list);
  }
  const articles: SoldArticle[] = [...byPost.entries()].map(([id, list]) => {
    const p = postOf.get(id)!;
    list.sort((a, b) => b.sales.valueMinor - a.sales.valueMinor || b.ordered.pieces - a.ordered.pieces || (a.name?.en ?? '').localeCompare(b.name?.en ?? ''));
    return {
      id,
      title: p.title,
      locale: p.locale,
      live: isLive(p, now),
      products: list,
      piecesOrdered: list.reduce((s, x) => s + x.ordered.pieces, 0),
      piecesDelivered: list.reduce((s, x) => s + x.sales.pieces, 0),
      salesMinor: list.reduce((s, x) => s + x.sales.valueMinor, 0),
      fromBlock: list.filter((x) => x.inBlock).reduce((s, x) => s + x.ordered.pieces, 0),
    };
  });
  articles.sort((a, b) => b.salesMinor - a.salesMinor || b.piecesOrdered - a.piecesOrdered || a.title.localeCompare(b.title));
  return { timeZone, from: span.from, to: span.to, days, counting: perf.count, credit: perf.credit, articles, products: productIds.length };
}

/** The report with pieces only (no money) for a viewer without `reports.read`. */
export function soldWithoutMoney(r: SoldReport): SoldReport {
  const z = (f: ArticleLineFigure): ArticleLineFigure => ({ ...f, valueMinor: 0 });
  return { ...r, articles: r.articles.map((a) => ({ ...a, salesMinor: 0, products: a.products.map((p) => ({ ...p, ordered: z(p.ordered), sales: z(p.sales) })) })) };
}
