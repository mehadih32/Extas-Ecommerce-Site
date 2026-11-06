// S12 · PR 239 (Blueprint C11, WEB-03) — the journal's articles, categories and authors on the database, the admin API
// and the shop's read.
//
// - An article (BlogPost) is written in one language with its own link (unique per store and language), a category, an
//   author, a search description, a focus keyword, a one-line answer, a main photo and the products its product block
//   shows (each checked to be this store's). Every save carries the version it was read at (STALE otherwise); words and
//   reading time are counted on save. Moves between states follow model.ts; each review pass is a BlogPostReview row
//   (append-only) with who passed it; with `blog.journal.reviewByAnother` on, the writer cannot pass his own article.
// - Categories are two levels (a main category and its sub-categories); authors are labelled honestly (an AI author is
//   always shown as one). Both are put away and restored, never deleted.
// - Seeing needs `blog.read`; writing, review passes and putting away need `blog.write`; publishing, scheduling, taking
//   down, editing a live article and the journal's switch need `blog.publish`. Every change is audited. Nothing here
//   touches a price, an order or a customer.
// - The shop reads only live articles (model.ts isLive) of its own store, and only while `blog.journal.on`.
import { audit, can, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { blogJournalSchema, storeTarget, type BlogJournalSettings } from '@extas/settings';
import { createHash } from 'node:crypto';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import {
  ACTION_PERMISSION,
  BLOG_ACTIONS,
  BLOG_COLUMNS,
  COLUMN_OF,
  REVIEW_STEP,
  actionsFor,
  authorInputSchema,
  categoryInputSchema,
  editSendsBack,
  isLive,
  issuesOf,
  nextState,
  postInputSchema,
  publishGaps,
  readingMinutes,
  slugOf,
  wordCount,
  type BlogAction,
  type BlogColumn,
  type BlogState,
} from './model';
import { clusterGaps } from './clusters-model';
import { autoPlace, dayFull } from './schedule';

const S = MOTHER_STORE_ID;
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
export interface JournalWho {
  actor: Actor;
  ctx: RequestContext;
}

export class JournalError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/** How many articles the board lists (newest change first). */
export const LIST_MAX = 500; // hardcode-ok: a list length, not a business number
/** How many products the editor's product picker offers. */
export const PICK_MAX = 300; // hardcode-ok: a list length, not a business number

// ---- articles ----

const POST_SELECT = {
  id: true,
  locale: true,
  slug: true,
  title: true,
  excerpt: true,
  body: true,
  status: true,
  featured: true,
  wordCount: true,
  readingMinutes: true,
  categoryId: true,
  authorId: true,
  metaDescription: true,
  focusKeyword: true,
  quickAnswer: true,
  heroAssetId: true,
  productIds: true,
  writerStaffId: true,
  scheduledAt: true,
  publishedAt: true,
  contentUpdatedAt: true,
  archivedAt: true,
  updatedAt: true,
} satisfies Prisma.BlogPostSelect;
type PostRow = Prisma.BlogPostGetPayload<{ select: typeof POST_SELECT }>;

export interface PostView {
  id: string;
  locale: 'en' | 'bn';
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  status: BlogState;
  column: BlogColumn;
  featured: boolean;
  wordCount: number;
  readingMinutes: number;
  categoryId: string | null;
  authorId: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  quickAnswer: string | null;
  heroAssetId: string | null;
  productIds: string[];
  writerStaffId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  live: boolean;
  actions: BlogAction[];
  gaps: string[];
  reviews: { stage: string; verdict: string; notes: string | null; reviewer: string | null; at: string }[];
  version: string;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
function viewOf(p: PostRow, now: Date, reviews: PostView['reviews'] = []): PostView {
  const status = p.status as BlogState;
  return {
    id: p.id,
    locale: p.locale === 'bn' ? 'bn' : 'en',
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    body: p.body ?? '',
    status,
    column: COLUMN_OF[status],
    featured: p.featured,
    wordCount: p.wordCount ?? 0,
    readingMinutes: p.readingMinutes ?? 0,
    categoryId: p.categoryId,
    authorId: p.authorId,
    metaDescription: p.metaDescription,
    focusKeyword: p.focusKeyword,
    quickAnswer: p.quickAnswer,
    heroAssetId: p.heroAssetId,
    productIds: p.productIds,
    writerStaffId: p.writerStaffId,
    scheduledAt: iso(p.scheduledAt),
    publishedAt: iso(p.publishedAt),
    contentUpdatedAt: iso(p.contentUpdatedAt),
    live: isLive({ status, scheduledAt: p.scheduledAt, archivedAt: p.archivedAt }, now),
    actions: actionsFor(status),
    gaps: publishGaps({ title: p.title, body: p.body, slug: p.slug }),
    reviews,
    version: p.updatedAt.toISOString(),
  };
}

export interface PostRowView {
  id: string;
  locale: 'en' | 'bn';
  title: string;
  slug: string;
  status: BlogState;
  column: BlogColumn;
  categoryId: string | null;
  authorId: string | null;
  readingMinutes: number;
  live: boolean;
  scheduledAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface JournalList {
  rows: PostRowView[];
  counts: Record<BlogColumn, number>;
  card: { key: 'journal'; value: BlogJournalSettings; version: string };
}

/** Every article (newest change first, at most LIST_MAX), the count per board column, and the journal's switch card. */
export async function journalList(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<JournalList> {
  const [posts, value] = await Promise.all([
    db.blogPost.findMany({ where: { storeId }, orderBy: { updatedAt: 'desc' }, take: LIST_MAX, select: POST_SELECT }),
    resolver.value('blog.journal', { storeId }),
  ]);
  const counts = Object.fromEntries(BLOG_COLUMNS.map((c) => [c, 0])) as Record<BlogColumn, number>;
  const rows = posts.map((p) => {
    const v = viewOf(p, now);
    counts[v.column] += 1;
    return { id: v.id, locale: v.locale, title: v.title, slug: v.slug, status: v.status, column: v.column, categoryId: v.categoryId, authorId: v.authorId, readingMinutes: v.readingMinutes, live: v.live, scheduledAt: v.scheduledAt, publishedAt: v.publishedAt, updatedAt: p.updatedAt.toISOString() };
  });
  return { rows, counts, card: { key: 'journal', value, version: versionOf(value) } };
}

/** One article for the editor, with its review history (null = not one of this store's). */
export async function journalPost(db: Db, id: string, now: Date = new Date(), storeId: number = S): Promise<PostView | null> {
  if (!isUuid(id)) return null;
  const p = await db.blogPost.findFirst({ where: { id, storeId }, select: POST_SELECT });
  if (!p) return null;
  const reviews = await db.blogPostReview.findMany({ where: { storeId, postId: id }, orderBy: { createdAt: 'asc' }, select: { stage: true, verdict: true, notes: true, reviewerId: true, createdAt: true } });
  const ids = [...new Set(reviews.map((r) => r.reviewerId).filter((x): x is string => !!x))];
  const names = ids.length ? new Map((await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName])) : new Map<string, string>();
  return viewOf(
    p,
    now,
    reviews.map((r) => ({ stage: r.stage, verdict: r.verdict, notes: r.notes, reviewer: r.reviewerId ? (names.get(r.reviewerId) ?? null) : null, at: r.createdAt.toISOString() })),
  );
}

/** What the editor's choices offer: the categories and authors not put away, and the products not archived. */
export async function journalChoices(db: Db, storeId: number = S) {
  const [categories, authors, products] = await Promise.all([
    db.blogCategory.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], select: { id: true, nameEn: true, nameBn: true, parentId: true } }),
    db.blogAuthor.findMany({ where: { storeId, archivedAt: null }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true, isAiAuthor: true } }),
    db.product.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: PICK_MAX, select: { id: true, nameEn: true, status: true } }),
  ]);
  return { categories, authors, products: products.map((p) => ({ id: p.id, name: p.nameEn, onSale: p.status === 'PUBLISHED' })) };
}

/** Create (id null) or save an article at the version it was read at. */
export async function saveJournalPost(db: Db, resolver: Resolver, who: JournalWho, id: string | null, input: unknown, now: Date = new Date(), storeId: number = S): Promise<PostView> {
  const ok = postInputSchema.safeParse(input);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const d = ok.data;
  const slug = slugOf(d);
  if (!slug) throw new JournalError('INVALID_INPUT', 400, ['slug']);
  const [category, author, hero, products, settings] = await Promise.all([
    d.categoryId ? db.blogCategory.findFirst({ where: { id: d.categoryId, storeId, archivedAt: null }, select: { id: true } }) : null,
    d.authorId ? db.blogAuthor.findFirst({ where: { id: d.authorId, storeId, archivedAt: null }, select: { id: true } }) : null,
    d.heroAssetId ? db.mediaAsset.findFirst({ where: { id: d.heroAssetId, storeId }, select: { id: true } }) : null,
    d.productIds.length ? db.product.count({ where: { storeId, id: { in: d.productIds } } }) : 0,
    resolver.value('blog.journal', { storeId }),
  ]);
  const bad = [d.categoryId && !category && 'categoryId', d.authorId && !author && 'authorId', d.heroAssetId && !hero && 'heroAssetId', products !== d.productIds.length && 'productIds'].filter((x): x is string => !!x);
  if (bad.length) throw new JournalError('INVALID_INPUT', 400, bad);

  const before = id ? await db.blogPost.findFirst({ where: { id, storeId }, select: POST_SELECT }) : null;
  if (id && !before) throw new JournalError('NOT_FOUND', 404);
  if (before && before.updatedAt.toISOString() !== d.version) throw new JournalError('STALE', 409);
  if (before?.status === 'ARCHIVED') throw new JournalError('ARCHIVED', 409);
  const status = (before?.status ?? 'DRAFT') as BlogState;
  // A live article's words are the shop's: changing them needs the publisher's key.
  if (before && (status === 'PUBLISHED' || status === 'SCHEDULED') && !(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);

  const words = wordCount(d.body);
  const fields = {
    locale: d.locale,
    slug,
    title: d.title,
    excerpt: d.excerpt,
    body: d.body,
    categoryId: d.categoryId,
    authorId: d.authorId,
    metaDescription: d.metaDescription,
    focusKeyword: d.focusKeyword,
    quickAnswer: d.quickAnswer,
    heroAssetId: d.heroAssetId,
    productIds: d.productIds,
    featured: d.featured,
    wordCount: words,
    readingMinutes: readingMinutes(words, d.locale, settings),
  };
  const wordsChanged = !!before && (before.title !== d.title || (before.body ?? '') !== d.body || before.excerpt !== d.excerpt || before.quickAnswer !== d.quickAnswer);
  let savedId: string;
  try {
    if (before) {
      const data: Prisma.BlogPostUpdateInput = { ...fields };
      if (wordsChanged && editSendsBack(status)) data.status = 'DRAFT';
      if (wordsChanged && status === 'PUBLISHED') data.contentUpdatedAt = now;
      savedId = (await db.blogPost.update({ where: { id: before.id }, data, select: { id: true } })).id;
    } else {
      savedId = (await db.blogPost.create({ data: { storeId, status: 'DRAFT', writerStaffId: who.actor.staffUserId, sourceUrls: [], ...fields }, select: { id: true } })).id;
    }
  } catch (e) {
    if (isUnique(e)) throw new JournalError('SLUG_TAKEN', 409, ['slug']);
    throw e;
  }
  const after = (await journalPost(db, savedId, now, storeId))!;
  await audit(
    db,
    who.actor,
    { storeId, action: before ? 'blog.post.save' : 'blog.post.create', entityType: 'BlogPost', entityId: savedId, before: before ? { status: before.status, title: before.title, slug: before.slug } : undefined, after: { status: after.status, title: after.title, slug: after.slug } },
    who.ctx,
  );
  return after;
}

/** Move an article: write, pass a review step, send back, schedule, publish, take down, put away, restore. */
export async function journalAction(db: Db, resolver: Resolver, who: JournalWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S): Promise<PostView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = (BLOG_ACTIONS as readonly string[]).includes(String(o.action)) ? (o.action as BlogAction) : null;
  if (!action) throw new JournalError('INVALID_INPUT', 400, ['action']);
  const need = ACTION_PERMISSION[action];
  if (need !== 'blog.write' && !(await can(db, who.actor, need, { storeId }))) throw new JournalError('FORBIDDEN', 403, [need]);
  const before = await db.blogPost.findFirst({ where: { id, storeId }, select: POST_SELECT });
  if (!before) throw new JournalError('NOT_FOUND', 404);
  if (before.updatedAt.toISOString() !== o.version) throw new JournalError('STALE', 409);
  const from = before.status as BlogState;
  const to = nextState(action, from);
  if (!to) throw new JournalError('WRONG_STATE', 409);
  const notes = typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim().slice(0, 1000) : null;

  const data: Prisma.BlogPostUpdateInput = { status: to };
  if (action === 'pass') {
    const settings = await resolver.value('blog.journal', { storeId });
    if (settings.reviewByAnother && before.writerStaffId && before.writerStaffId === who.actor.staffUserId) throw new JournalError('OWN_ARTICLE', 409);
  }
  if (action === 'schedule') {
    const at = typeof o.scheduledAt === 'string' ? new Date(o.scheduledAt) : null;
    if (!at || Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) throw new JournalError('INVALID_INPUT', 400, ['scheduledAt']);
    data.scheduledAt = at;
    if (!before.publishedAt) data.publishedAt = at;
    // PR 245: never more than `blog.schedule.perDayMax` articles on one shop-time day.
    if (await dayFull(db, resolver, at, before.id, storeId)) throw new JournalError('DAY_FULL', 409);
  }
  if (action === 'schedule' || action === 'publish') {
    const gaps = publishGaps({ title: before.title, body: before.body, slug: before.slug });
    if (gaps.length) throw new JournalError('NOT_READY', 409, gaps);
    // PR 242: with `blog.clusters.requireLinks` on, an article of a cluster goes live only with its required links.
    const missing = await linkGapsFor(db, resolver, before.id, now, storeId);
    if (missing.length) throw new JournalError('LINKS_MISSING', 409, missing);
  }
  if (action === 'unschedule' && before.scheduledAt && before.publishedAt?.getTime() === before.scheduledAt.getTime()) data.publishedAt = null;
  if (action === 'publish') {
    // The first time it went live is kept; a scheduled article published by hand before its time goes live now.
    const early = from === 'SCHEDULED' && !!before.scheduledAt && before.scheduledAt.getTime() > now.getTime() && before.publishedAt?.getTime() === before.scheduledAt.getTime();
    data.publishedAt = !before.publishedAt || early ? now : before.publishedAt;
  }
  if (action === 'archive') data.archivedAt = now;
  if (action === 'restore') data.archivedAt = null;

  await db.$transaction(async (tx) => {
    await tx.blogPost.update({ where: { id: before.id }, data });
    const step = action === 'pass' ? REVIEW_STEP[from] : null;
    if (step || action === 'back') {
      await tx.blogPostReview.create({ data: { storeId, postId: before.id, stage: step ? step.stage : 'writing', reviewerId: who.actor.staffUserId, verdict: step ? 'pass' : 'back', notes } });
    }
  });
  await audit(db, who.actor, { storeId, action: `blog.post.${action}`, entityType: 'BlogPost', entityId: before.id, before: { status: from }, after: { status: to } }, who.ctx);
  if (action === 'pass' && to === 'SEO_CHECKED') await autoPublish(db, resolver, who, before.id, now, storeId);
  // PR 245: not published by itself — with `blog.schedule.autoFill` on it takes the next free time on the calendar.
  if (action === 'pass' && to === 'SEO_CHECKED') await autoPlace(db, resolver, who, before.id, now, storeId);
  return (await journalPost(db, before.id, now, storeId))!;
}

/**
 * PR 244: with `blog.approval` in 'auto' mode and `autoPublish` on, an article written from an approved topic goes live
 * as soon as its last review step passes — only when nothing is missing (its words, and its required links while
 * `blog.clusters.requireLinks` is on). Otherwise it waits for a publisher, as before. Audited as decided by itself.
 */
async function autoPublish(db: Db, resolver: Resolver, who: JournalWho, id: string, now: Date, storeId: number): Promise<void> {
  const approval = await resolver.value('blog.approval', { storeId });
  if (approval.mode !== 'auto' || !approval.autoPublish) return;
  const post = await db.blogPost.findFirst({ where: { id, storeId, status: 'SEO_CHECKED' }, select: { id: true, topicId: true, title: true, body: true, slug: true, publishedAt: true } });
  if (!post?.topicId) return;
  const topic = await db.blogTopic.findFirst({ where: { id: post.topicId, storeId, status: 'approved', archivedAt: null }, select: { id: true } });
  if (!topic || publishGaps(post).length || (await linkGapsFor(db, resolver, id, now, storeId)).length) return;
  const moved = await db.blogPost.updateMany({ where: { id, storeId, status: 'SEO_CHECKED' }, data: { status: 'PUBLISHED', publishedAt: post.publishedAt ?? now } });
  if (moved.count) await audit(db, who.actor, { storeId, action: 'blog.post.autoPublish', entityType: 'BlogPost', entityId: id, before: { status: 'SEO_CHECKED' }, after: { status: 'PUBLISHED', title: post.title } }, who.ctx);
}

/** The shop paths an article of a cluster still has to link to, only while `blog.clusters.requireLinks` is on. */
export async function linkGapsFor(db: Db, resolver: Resolver, postId: string, now: Date, storeId: number = S): Promise<string[]> {
  const rules = await resolver.value('blog.clusters', { storeId });
  if (!rules.requireLinks) return [];
  const post = await db.blogPost.findFirst({ where: { id: postId, storeId }, select: { clusterId: true } });
  if (!post?.clusterId) return [];
  const [cluster, members] = await Promise.all([
    db.contentCluster.findFirst({ where: { id: post.clusterId, storeId, archivedAt: null }, select: { pillarPostId: true, targetPath: true } }),
    db.blogPost.findMany({ where: { storeId, clusterId: post.clusterId, archivedAt: null }, select: { id: true, slug: true, title: true, body: true, status: true, scheduledAt: true, archivedAt: true } }),
  ]);
  if (!cluster) return [];
  const gaps = clusterGaps(cluster, members.map((m) => ({ id: m.id, slug: m.slug, title: m.title, body: m.body, live: isLive({ status: m.status as BlogState, scheduledAt: m.scheduledAt, archivedAt: m.archivedAt }, now) })), rules);
  return (gaps.get(postId) ?? []).map((g) => g.path);
}

/** PUT {key: 'journal', value, version}: the journal's switch and numbers (`blog.publish`; audited). */
export async function saveJournalSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, now: Date = new Date(), storeId: number = S): Promise<JournalList> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'journal') throw new JournalError('INVALID_INPUT', 400, ['key']);
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const before = await resolver.value('blog.journal', { storeId });
  if (o.version !== versionOf(before)) throw new JournalError('STALE', 409);
  const ok = blogJournalSchema.safeParse(o.value);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) !== versionOf(before)) {
    await resolver.set('blog.journal', ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal' });
    await audit(db, who.actor, { storeId, action: 'blog.journal.settings', entityType: 'Setting', entityId: 'blog.journal', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return journalList(db, resolver, now, storeId);
}

// ---- categories and authors ----

export type ShelfKind = 'categories' | 'authors';

export interface CategoryView {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  introEn: string | null;
  introBn: string | null;
  parentId: string | null;
  sortOrder: number;
  archived: boolean;
  posts: number;
  version: string;
}

export interface AuthorView {
  id: string;
  slug: string;
  displayName: string;
  isAiAuthor: boolean;
  bioEn: string | null;
  bioBn: string | null;
  reviewerLine: string | null;
  archived: boolean;
  posts: number;
  version: string;
}

export async function journalCategories(db: Db, storeId: number = S): Promise<CategoryView[]> {
  const rows = await db.blogCategory.findMany({ where: { storeId }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], include: { _count: { select: { posts: true } } } });
  return rows.map((c) => ({ id: c.id, slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, introEn: c.introEn, introBn: c.introBn, parentId: c.parentId, sortOrder: c.sortOrder, archived: !!c.archivedAt, posts: c._count.posts, version: c.updatedAt.toISOString() }));
}

export async function journalAuthors(db: Db, storeId: number = S): Promise<AuthorView[]> {
  const rows = await db.blogAuthor.findMany({ where: { storeId }, orderBy: { displayName: 'asc' }, include: { _count: { select: { posts: true } } } });
  return rows.map((a) => ({ id: a.id, slug: a.slug, displayName: a.displayName, isAiAuthor: a.isAiAuthor, bioEn: a.bioEn, bioBn: a.bioBn, reviewerLine: a.reviewerLine, archived: !!a.archivedAt, posts: a._count.posts, version: a.updatedAt.toISOString() }));
}

/** Create (id null) or save a category: two levels at most, never its own main category. */
export async function saveCategory(db: Db, who: JournalWho, id: string | null, input: unknown, storeId: number = S): Promise<CategoryView[]> {
  const ok = categoryInputSchema.safeParse(input);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const d = ok.data;
  const before = id ? await db.blogCategory.findFirst({ where: { id, storeId }, include: { _count: { select: { children: true } } } }) : null;
  if (id && !before) throw new JournalError('NOT_FOUND', 404);
  if (before && before.updatedAt.toISOString() !== d.version) throw new JournalError('STALE', 409);
  if (d.parentId) {
    const parent = await db.blogCategory.findFirst({ where: { id: d.parentId, storeId, archivedAt: null }, select: { id: true, parentId: true } });
    // the main category must exist, be a main category itself and not be this one; a category with sub-categories stays a main one
    if (!parent || parent.parentId || parent.id === id || (before?._count.children ?? 0) > 0) throw new JournalError('INVALID_INPUT', 400, ['parentId']);
  }
  const { version: _v, ...fields } = d;
  let savedId: string;
  try {
    savedId = before
      ? (await db.blogCategory.update({ where: { id: before.id }, data: { ...fields, isPillar: !d.parentId }, select: { id: true } })).id
      : (await db.blogCategory.create({ data: { storeId, ...fields, isPillar: !d.parentId }, select: { id: true } })).id;
  } catch (e) {
    if (isUnique(e)) throw new JournalError('SLUG_TAKEN', 409, ['slug']);
    throw e;
  }
  await audit(db, who.actor, { storeId, action: before ? 'blog.category.save' : 'blog.category.create', entityType: 'BlogCategory', entityId: savedId, before: before ? { slug: before.slug, nameEn: before.nameEn, parentId: before.parentId } : undefined, after: { slug: d.slug, nameEn: d.nameEn, parentId: d.parentId } }, who.ctx);
  return journalCategories(db, storeId);
}

/** Create (id null) or save an author. */
export async function saveAuthor(db: Db, who: JournalWho, id: string | null, input: unknown, storeId: number = S): Promise<AuthorView[]> {
  const ok = authorInputSchema.safeParse(input);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const d = ok.data;
  const before = id ? await db.blogAuthor.findFirst({ where: { id, storeId } }) : null;
  if (id && !before) throw new JournalError('NOT_FOUND', 404);
  if (before && before.updatedAt.toISOString() !== d.version) throw new JournalError('STALE', 409);
  const { version: _v, ...fields } = d;
  let savedId: string;
  try {
    savedId = before ? (await db.blogAuthor.update({ where: { id: before.id }, data: fields, select: { id: true } })).id : (await db.blogAuthor.create({ data: { storeId, ...fields }, select: { id: true } })).id;
  } catch (e) {
    if (isUnique(e)) throw new JournalError('SLUG_TAKEN', 409, ['slug']);
    throw e;
  }
  await audit(db, who.actor, { storeId, action: before ? 'blog.author.save' : 'blog.author.create', entityType: 'BlogAuthor', entityId: savedId, before: before ? { slug: before.slug, displayName: before.displayName, isAiAuthor: before.isAiAuthor } : undefined, after: { slug: d.slug, displayName: d.displayName, isAiAuthor: d.isAiAuthor } }, who.ctx);
  return journalAuthors(db, storeId);
}

/** Put a category or an author away, or restore it (never deleted; its articles keep it). */
export async function shelfAction(db: Db, who: JournalWho, kind: ShelfKind, id: string, input: unknown, now: Date = new Date(), storeId: number = S) {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.action !== 'archive' && o.action !== 'restore') throw new JournalError('INVALID_INPUT', 400, ['action']);
  const archivedAt = o.action === 'archive' ? now : null;
  const before = kind === 'categories' ? await db.blogCategory.findFirst({ where: { id, storeId }, select: { id: true, archivedAt: true, updatedAt: true } }) : await db.blogAuthor.findFirst({ where: { id, storeId }, select: { id: true, archivedAt: true, updatedAt: true } });
  if (!before) throw new JournalError('NOT_FOUND', 404);
  if (before.updatedAt.toISOString() !== o.version) throw new JournalError('STALE', 409);
  if (!!before.archivedAt === (o.action === 'archive')) throw new JournalError('WRONG_STATE', 409);
  if (kind === 'categories') {
    // a main category is put away only after its sub-categories
    if (o.action === 'archive' && (await db.blogCategory.count({ where: { storeId, parentId: id, archivedAt: null } }))) throw new JournalError('HAS_CHILDREN', 409);
    await db.blogCategory.update({ where: { id }, data: { archivedAt } });
  } else await db.blogAuthor.update({ where: { id }, data: { archivedAt } });
  await audit(db, who.actor, { storeId, action: `blog.${kind === 'categories' ? 'category' : 'author'}.${o.action}`, entityType: kind === 'categories' ? 'BlogCategory' : 'BlogAuthor', entityId: id }, who.ctx);
  return kind === 'categories' ? journalCategories(db, storeId) : journalAuthors(db, storeId);
}

// ---- the shop's read ----

export interface LivePost {
  id: string;
  locale: 'en' | 'bn';
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  quickAnswer: string | null;
  metaDescription: string | null;
  heroAssetId: string | null;
  productIds: string[];
  featured: boolean;
  readingMinutes: number;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  category: { slug: string; nameEn: string; nameBn: string | null } | null;
  author: { slug: string; displayName: string; isAiAuthor: boolean; reviewerLine: string | null } | null;
}

const LIVE_SELECT = {
  ...POST_SELECT,
  category: { select: { slug: true, nameEn: true, nameBn: true, archivedAt: true } },
  author: { select: { slug: true, displayName: true, isAiAuthor: true, reviewerLine: true, archivedAt: true } },
} satisfies Prisma.BlogPostSelect;

const liveWhere = (storeId: number, locale: 'en' | 'bn', now: Date): Prisma.BlogPostWhereInput => ({
  storeId,
  locale,
  archivedAt: null,
  OR: [{ status: 'PUBLISHED' }, { status: 'SCHEDULED', scheduledAt: { lte: now } }],
});

function liveOf(p: Prisma.BlogPostGetPayload<{ select: typeof LIVE_SELECT }>): LivePost {
  return {
    id: p.id,
    locale: p.locale === 'bn' ? 'bn' : 'en',
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    body: p.body ?? '',
    quickAnswer: p.quickAnswer,
    metaDescription: p.metaDescription,
    heroAssetId: p.heroAssetId,
    productIds: p.productIds,
    featured: p.featured,
    readingMinutes: p.readingMinutes ?? 0,
    publishedAt: iso(p.publishedAt ?? p.scheduledAt),
    contentUpdatedAt: iso(p.contentUpdatedAt),
    category: p.category && !p.category.archivedAt ? { slug: p.category.slug, nameEn: p.category.nameEn, nameBn: p.category.nameBn } : null,
    author: p.author && !p.author.archivedAt ? { slug: p.author.slug, displayName: p.author.displayName, isAiAuthor: p.author.isAiAuthor, reviewerLine: p.author.reviewerLine } : null,
  };
}

/** The live articles of a language (optionally one category's, with its sub-categories), newest first, one page. */
export async function liveJournal(db: Db, storeId: number, locale: 'en' | 'bn', opts: { categoryIds?: string[]; page: number; perPage: number }, now: Date = new Date()) {
  const where: Prisma.BlogPostWhereInput = { ...liveWhere(storeId, locale, now), ...(opts.categoryIds ? { categoryId: { in: opts.categoryIds } } : {}) };
  const [total, rows] = await Promise.all([
    db.blogPost.count({ where }),
    db.blogPost.findMany({ where, orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }], skip: Math.max(0, opts.page - 1) * opts.perPage, take: opts.perPage, select: LIVE_SELECT }),
  ]);
  return { total, posts: rows.map(liveOf) };
}

/** One live article at its link in a language (null = none). */
export async function livePost(db: Db, storeId: number, locale: 'en' | 'bn', slug: string, now: Date = new Date()): Promise<LivePost | null> {
  const p = await db.blogPost.findFirst({ where: { ...liveWhere(storeId, locale, now), slug }, select: LIVE_SELECT });
  return p ? liveOf(p) : null;
}

/** The categories not put away (for the shop's category chips and pages). */
export async function liveCategories(db: Db, storeId: number) {
  return db.blogCategory.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], select: { id: true, slug: true, nameEn: true, nameBn: true, introEn: true, introBn: true, parentId: true } });
}

// ---- the admin API ----

export const answer = (e: unknown): Response => (e instanceof JournalError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/blog/posts[/<id>] — GET the board (`blog.read`) with the editor's choices, or one article; POST a new
 * article; PUT the journal's card (no id, `blog.publish`) or an article; POST {action, version} on an article (the
 * action's own key, model.ts ACTION_PERMISSION).
 */
export async function journalHandler(request: Request, deps: AdminDeps | null, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const resolver = deps!.resolver;
  const now = deps!.now?.() ?? new Date();
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (!id) {
      if (method === 'GET') {
        const [list, choices] = await Promise.all([journalList(db, resolver, now), journalChoices(db)]);
        return json({ ok: true, list, choices, cards: { journal: list.card } });
      }
      if (method === 'PUT') {
        const list = await saveJournalSettings(db, resolver, who, await body(request), now);
        return json({ ok: true, list, cards: { journal: list.card } });
      }
      return json({ ok: true, post: await saveJournalPost(db, resolver, who, null, await body(request), now) }, { status: 201 });
    }
    if (method === 'GET') {
      const post = await journalPost(db, id, now);
      return post ? json({ ok: true, post }) : fail(404, 'NOT_FOUND');
    }
    if (!isUuid(id)) return fail(404, 'NOT_FOUND');
    if (method === 'PUT') return json({ ok: true, post: await saveJournalPost(db, resolver, who, id, await body(request), now) });
    return json({ ok: true, post: await journalAction(db, resolver, who, id, await body(request), now) });
  } catch (e) {
    return answer(e);
  }
}

/**
 * /api/admin/blog/{categories,authors}[/<id>] — GET the list (`blog.read`); POST a new one (no id) or {action, version}
 * to put one away or restore it; PUT one (all `blog.write`).
 */
export async function shelfHandler(request: Request, deps: AdminDeps | null, kind: ShelfKind, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  if (id && !isUuid(id)) return fail(404, 'NOT_FOUND');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const now = deps!.now?.() ?? new Date();
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    let rows: CategoryView[] | AuthorView[];
    if (method === 'GET') rows = kind === 'categories' ? await journalCategories(db) : await journalAuthors(db);
    else if (method === 'PUT') {
      if (!id) return fail(405, 'method-not-allowed');
      rows = kind === 'categories' ? await saveCategory(db, who, id, await body(request)) : await saveAuthor(db, who, id, await body(request));
    } else if (id) rows = await shelfAction(db, who, kind, id, await body(request), now);
    else rows = kind === 'categories' ? await saveCategory(db, who, null, await body(request)) : await saveAuthor(db, who, null, await body(request));
    return json({ ok: true, [kind]: rows }, { status: method === 'POST' && !id ? 201 : 200 });
  } catch (e) {
    return answer(e);
  }
}
