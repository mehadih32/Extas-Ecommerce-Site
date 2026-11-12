// S12 · PR 242 (Blueprint C4.5 "topical cluster planner", C11.2; demo 94-admin-blog.js topics tab) — the plan of the
// journal on the database: clusters (a pillar article and its supporting articles, all pointing at one shop page),
// the planned topics in each, and the links every article still lacks.
//
// - A cluster (ContentCluster) has a name in both languages, the journal category it lives in, the shop page its
//   articles link to (a collection or a product), its pillar article and its keywords; put away and restored, never
//   deleted. An article joins a cluster (BlogPost.clusterId) or leaves it; the pillar is one of its articles.
// - A topic (BlogTopic) is an article still to write: title, search phrase, language, priority, pillar or supporting,
//   writer. A writer's topic is proposed; the publisher's (the owner's) is approved at once; approving and rejecting
//   need `blog.publish`. A topic very close to an article or topic (`blog.clusters.dupWarn`) needs a second press.
//   "Start writing" makes the article as a draft in the cluster (its category, author and focus keyword filled in).
// - Seeing needs `blog.read`; changes `blog.write`; the planner's card `blog.publish`. Every change is audited.
import { audit, can } from '@extas/auth';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { blogApprovalSchema, blogClustersSchema, storeTarget, type BlogApprovalSettings, type BlogClustersSettings } from '@extas/settings';
import { body, fail, guardAdmin, isUuid, json, type AdminDeps } from '../admin-auth';
import { ROUTES } from '../shop/routes';
import { COLUMN_OF, isLive, issuesOf, slugify, type BlogColumn, type BlogState } from './model';
import { authorForPillar, pickReviewer } from './authors-model';
import { JournalError, LIST_MAX, PICK_MAX, answer, ensureAuthorTeam, versionOf, type JournalWho } from './journal';
import {
  TOPIC_ACTIONS,
  TOPIC_PERMISSION,
  alikeLevel,
  closest,
  clusterGaps,
  clusterInputSchema,
  topicInputSchema,
  topicNext,
  autoDecision,
  batchSplit,
  monthOf,
  type Alike,
  type AlikeLevel,
  type Comparable,
  type LinkGap,
  type TopicAction,
} from './clusters-model';

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: the length of a day
type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];

export interface PlanPost {
  id: string;
  title: string;
  slug: string;
  locale: string;
  column: BlogColumn;
  live: boolean;
  gaps: LinkGap[];
}
export interface PlanTopic {
  id: string;
  title: string;
  query: string | null;
  locale: string;
  priority: number;
  isPillar: boolean;
  status: string;
  clusterId: string | null;
  /** PR 593: the section it belongs to; when the author is one of the five under Doot, this is how it was chosen. */
  pillar: string | null;
  authorId: string | null;
  postId: string | null;
  postColumn: BlogColumn | null;
  archived: boolean;
  alike: (Alike & { level: 'near' | 'warn' }) | null;
  batchMonth: string | null;
  /** PR 528: the topic's brief, when one is written. */
  briefId: string | null;
  version: string;
}
export interface PlanCluster {
  id: string;
  name: string;
  nameBn: string | null;
  categoryId: string | null;
  targetPath: string | null;
  keywords: string[];
  sortOrder: number;
  archived: boolean;
  pillarPostId: string | null;
  posts: PlanPost[];
  topics: PlanTopic[];
  gaps: number;
  version: string;
}
export interface Plan {
  clusters: PlanCluster[];
  /** Articles in no cluster (not put away): each one is a page nothing in the plan points at. */
  loose: PlanPost[];
  /** Topics in no cluster. */
  topics: PlanTopic[];
  counts: { proposed: number; approved: number; writing: number; gaps: number };
  card: { key: 'clusters'; value: BlogClustersSettings; version: string };
  /** PR 244: the topics waiting for the owner's yes, by monthly batch (newest month first). */
  queue: { month: string; topics: PlanTopic[] }[];
  /** PR 244: what was decided by itself over the last `blog.approval.digestDays` days (newest first). */
  digest: { days: number; items: { kind: 'topic' | 'post'; id: string; title: string; at: string }[] };
  approval: { key: 'approval'; value: BlogApprovalSettings; version: string };
  choices: {
    categories: { id: string; nameEn: string; nameBn: string | null }[];
    authors: { id: string; displayName: string; isAiAuthor: boolean }[];
    targets: { path: string; label: string; kind: 'collection' | 'product' }[];
  };
}

const POST_SELECT = { id: true, title: true, slug: true, locale: true, status: true, body: true, clusterId: true, scheduledAt: true, archivedAt: true } satisfies Prisma.BlogPostSelect;

/** The whole plan: clusters with their articles (and the links each lacks), topics, loose articles, the card. */
export async function clusterPlan(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<Plan> {
  const [rules, approval, clusters, posts, topics, categories, authors, collections, products, prefix, briefs] = await Promise.all([
    resolver.value('blog.clusters', { storeId }),
    resolver.value('blog.approval', { storeId }),
    db.contentCluster.findMany({ where: { storeId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    db.blogPost.findMany({ where: { storeId, archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: LIST_MAX, select: POST_SELECT }),
    db.blogTopic.findMany({ where: { storeId }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }], take: LIST_MAX }),
    db.blogCategory.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], select: { id: true, nameEn: true, nameBn: true } }),
    db.blogAuthor.findMany({ where: { storeId, archivedAt: null }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true, isAiAuthor: true } }),
    db.category.findMany({ where: { storeId, archivedAt: null }, orderBy: { nameEn: 'asc' }, take: PICK_MAX, select: { slug: true, nameEn: true } }),
    db.product.findMany({ where: { storeId, archivedAt: null }, orderBy: { nameEn: 'asc' }, take: PICK_MAX, select: { slug: true, nameEn: true } }),
    resolver.value('naming.productPathPrefix', { storeId }),
    db.blogBrief.findMany({ where: { storeId, topicId: { not: null } }, take: LIST_MAX, select: { id: true, topicId: true } }),
  ]);
  const briefOf = new Map(briefs.map((b) => [b.topicId, b.id]));
  const live = (p: (typeof posts)[number]) => isLive({ status: p.status as BlogState, scheduledAt: p.scheduledAt, archivedAt: p.archivedAt }, now);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const pool: Comparable[] = [
    ...posts.map((p) => ({ kind: 'post' as const, id: p.id, title: p.title, query: null })),
    ...topics.filter((t) => !t.archivedAt && t.status !== 'rejected' && !t.postId).map((t) => ({ kind: 'topic' as const, id: t.id, title: t.title, query: t.query })),
  ];
  const topicView = (t: (typeof topics)[number]): PlanTopic => {
    const post = t.postId ? postById.get(t.postId) : undefined;
    const open = !t.archivedAt && !t.postId && t.status !== 'rejected';
    const a = open ? closest(t.title, t.query, pool, [t.id]) : null;
    const level = alikeLevel(a, rules);
    return {
      id: t.id,
      title: t.title,
      query: t.query,
      locale: t.locale,
      priority: t.priority,
      isPillar: t.isPillar,
      status: t.status,
      clusterId: t.clusterId,
      pillar: t.pillar,
      authorId: t.authorId,
      postId: t.postId,
      postColumn: post ? COLUMN_OF[post.status as BlogState] : null,
      archived: !!t.archivedAt,
      alike: a && level !== 'none' ? { ...a, level } : null,
      batchMonth: t.batchMonth,
      briefId: briefOf.get(t.id) ?? null,
      version: t.updatedAt.toISOString(),
    };
  };
  let gapsAll = 0;
  const views = clusters.map((c): PlanCluster => {
    const members = posts.filter((p) => p.clusterId === c.id);
    const gaps = clusterGaps(c, members.map((m) => ({ id: m.id, slug: m.slug, title: m.title, body: m.body, live: live(m) })), rules);
    const n = [...gaps.values()].reduce((s, g) => s + g.length, 0);
    if (!c.archivedAt) gapsAll += n;
    const pv = (m: (typeof posts)[number]): PlanPost => ({ id: m.id, title: m.title, slug: m.slug, locale: m.locale, column: COLUMN_OF[m.status as BlogState], live: live(m), gaps: gaps.get(m.id) ?? [] });
    const ordered = [...members.filter((m) => m.id === c.pillarPostId), ...members.filter((m) => m.id !== c.pillarPostId)];
    return {
      id: c.id,
      name: c.name,
      nameBn: c.nameBn,
      categoryId: c.categoryId,
      targetPath: c.targetPath,
      keywords: c.keywords,
      sortOrder: c.sortOrder,
      archived: !!c.archivedAt,
      pillarPostId: members.some((m) => m.id === c.pillarPostId) ? c.pillarPostId : null,
      posts: ordered.map(pv),
      topics: topics.filter((t) => t.clusterId === c.id).map(topicView),
      gaps: n,
      version: c.updatedAt.toISOString(),
    };
  });
  const clusterIds = new Set(clusters.map((c) => c.id));
  const all = topics.filter((t) => !t.archivedAt);
  const pre = `/${prefix.replace(/^\/+|\/+$/g, '')}`;
  const allViews = [...views.flatMap((v) => v.topics), ...topics.filter((t) => !t.clusterId || !clusterIds.has(t.clusterId)).map(topicView)];
  const waiting = allViews.filter((t) => t.status === 'proposed' && !t.archived);
  const months = [...new Set(waiting.map((t) => t.batchMonth ?? ''))].sort().reverse();
  const since = new Date(now.getTime() - approval.digestDays * DAY_MS);
  const decided = await db.auditLog.findMany({ where: { storeId, action: { in: ['blog.topic.auto', 'blog.post.autoPublish'] }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: LIST_MAX, select: { action: true, entityId: true, after: true, createdAt: true } });
  return {
    queue: months.map((m) => ({ month: m, topics: waiting.filter((t) => (t.batchMonth ?? '') === m) })),
    digest: {
      days: approval.digestDays,
      items: decided.map((r) => ({ kind: r.action === 'blog.topic.auto' ? ('topic' as const) : ('post' as const), id: r.entityId ?? '', title: String((r.after as { title?: unknown } | null)?.title ?? ''), at: r.createdAt.toISOString() })),
    },
    approval: { key: 'approval', value: approval, version: versionOf(approval) },
    clusters: views,
    loose: posts.filter((p) => !p.clusterId || !clusterIds.has(p.clusterId)).map((m) => ({ id: m.id, title: m.title, slug: m.slug, locale: m.locale, column: COLUMN_OF[m.status as BlogState], live: live(m), gaps: [] })),
    topics: topics.filter((t) => !t.clusterId || !clusterIds.has(t.clusterId)).map(topicView),
    counts: {
      proposed: all.filter((t) => t.status === 'proposed').length,
      approved: all.filter((t) => t.status === 'approved' && !t.postId).length,
      writing: all.filter((t) => !!t.postId).length,
      gaps: gapsAll,
    },
    card: { key: 'clusters', value: rules, version: versionOf(rules) },
    choices: {
      categories,
      authors,
      targets: [
        ...collections.map((c) => ({ path: ROUTES.category(c.slug), label: c.nameEn, kind: 'collection' as const })),
        ...products.map((p) => ({ path: `${pre}/${p.slug}`, label: p.nameEn, kind: 'product' as const })),
      ],
    },
  };
}

// ---- clusters ----

/** Create (id null) or save a cluster at the version it was read at. */
export async function saveCluster(db: Db, who: JournalWho, id: string | null, input: unknown, storeId: number = S): Promise<void> {
  const ok = clusterInputSchema.safeParse(input);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const d = ok.data;
  if (d.categoryId && !(await db.blogCategory.findFirst({ where: { id: d.categoryId, storeId }, select: { id: true } }))) throw new JournalError('INVALID_INPUT', 400, ['categoryId']);
  const before = id ? await db.contentCluster.findFirst({ where: { id, storeId } }) : null;
  if (id && !before) throw new JournalError('NOT_FOUND', 404);
  if (before && before.updatedAt.toISOString() !== d.version) throw new JournalError('STALE', 409);
  const fields = { name: d.name, nameBn: d.nameBn, categoryId: d.categoryId, targetPath: d.targetPath, keywords: d.keywords, sortOrder: d.sortOrder };
  const saved = before ? await db.contentCluster.update({ where: { id: before.id }, data: fields }) : await db.contentCluster.create({ data: { storeId, ...fields } });
  await audit(db, who.actor, { storeId, action: before ? 'blog.cluster.save' : 'blog.cluster.create', entityType: 'ContentCluster', entityId: saved.id, before: before ? { name: before.name, targetPath: before.targetPath } : undefined, after: { name: saved.name, targetPath: saved.targetPath } }, who.ctx);
}

const CLUSTER_ACTIONS = ['add', 'remove', 'pillar', 'archive', 'restore'] as const;
type ClusterAction = (typeof CLUSTER_ACTIONS)[number];

/** An article joins or leaves the cluster, becomes its pillar (null: none), or the cluster is put away / restored. */
export async function clusterAction(db: Db, who: JournalWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S): Promise<void> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = (CLUSTER_ACTIONS as readonly string[]).includes(String(o.action)) ? (o.action as ClusterAction) : null;
  if (!action) throw new JournalError('INVALID_INPUT', 400, ['action']);
  const c = await db.contentCluster.findFirst({ where: { id, storeId } });
  if (!c) throw new JournalError('NOT_FOUND', 404);
  if (c.updatedAt.toISOString() !== o.version) throw new JournalError('STALE', 409);
  if ((action === 'restore') !== !!c.archivedAt) throw new JournalError('WRONG_STATE', 409);
  const postId = typeof o.postId === 'string' && isUuid(o.postId) ? o.postId : null;
  if ((action === 'add' || action === 'remove' || (action === 'pillar' && o.postId !== null)) && !postId) throw new JournalError('INVALID_INPUT', 400, ['postId']);
  const post = postId ? await db.blogPost.findFirst({ where: { id: postId, storeId }, select: { id: true, clusterId: true, archivedAt: true } }) : null;
  if (postId && !post) throw new JournalError('INVALID_INPUT', 400, ['postId']);
  if (action === 'add' && post?.archivedAt) throw new JournalError('WRONG_STATE', 409);
  if (action === 'remove' && post?.clusterId !== c.id) throw new JournalError('WRONG_STATE', 409);
  if (action === 'pillar' && post && post.clusterId !== c.id) throw new JournalError('WRONG_STATE', 409);

  await db.$transaction(async (tx) => {
    if (action === 'add') {
      // Leaving its old cluster: it is no longer that cluster's pillar.
      if (post!.clusterId && post!.clusterId !== c.id) await tx.contentCluster.updateMany({ where: { id: post!.clusterId, storeId, pillarPostId: post!.id }, data: { pillarPostId: null } });
      await tx.blogPost.update({ where: { id: post!.id }, data: { clusterId: c.id } });
    }
    if (action === 'remove') await tx.blogPost.update({ where: { id: post!.id }, data: { clusterId: null } });
    const data: Prisma.ContentClusterUpdateInput = {};
    if (action === 'pillar') data.pillarPostId = post?.id ?? null;
    if (action === 'remove' && c.pillarPostId === post!.id) data.pillarPostId = null;
    if (action === 'archive') data.archivedAt = now;
    if (action === 'restore') data.archivedAt = null;
    // The cluster's version moves with every change to it, its articles included.
    await tx.contentCluster.update({ where: { id: c.id }, data: { ...data, updatedAt: now } });
  });
  await audit(db, who.actor, { storeId, action: `blog.cluster.${action}`, entityType: 'ContentCluster', entityId: c.id, after: postId ? { postId } : undefined }, who.ctx);
}

// ---- topics ----

/**
 * Create (id null) or save a topic. A new one very close to an article or topic needs `force` (the second press).
 * Answers the topic's id (PR 528: a brief typed with a new topic makes the topic through here).
 */
export async function saveTopic(db: Db, resolver: Resolver, who: JournalWho, id: string | null, input: unknown, now: Date = new Date(), storeId: number = S): Promise<string> {
  const ok = topicInputSchema.safeParse(input);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  const d = ok.data;
  const [cluster, author] = await Promise.all([
    d.clusterId ? db.contentCluster.findFirst({ where: { id: d.clusterId, storeId, archivedAt: null }, select: { id: true } }) : null,
    d.authorId ? db.blogAuthor.findFirst({ where: { id: d.authorId, storeId, archivedAt: null }, select: { id: true } }) : null,
  ]);
  const bad = [d.clusterId && !cluster && 'clusterId', d.authorId && !author && 'authorId'].filter((x): x is string => !!x);
  if (bad.length) throw new JournalError('INVALID_INPUT', 400, bad);
  const before = id ? await db.blogTopic.findFirst({ where: { id, storeId } }) : null;
  if (id && !before) throw new JournalError('NOT_FOUND', 404);
  if (before && before.updatedAt.toISOString() !== d.version) throw new JournalError('STALE', 409);
  if (before && (before.archivedAt || before.postId)) throw new JournalError('WRONG_STATE', 409);
  // PR 593: a new topic with a section and no author by hand gets the matching one of the five under Doot.
  let autoAuthorId = d.authorId;
  if (!before && !d.authorId && d.pillar) {
    await ensureAuthorTeam(db, storeId);
    const ai = await db.blogAuthor.findMany({ where: { storeId, archivedAt: null, isAiAuthor: true }, orderBy: { agentKey: 'asc' }, select: { id: true, agentKey: true } });
    autoAuthorId = authorForPillar(d.pillar, ai);
  }
  let level: AlikeLevel = 'none';
  if (!before) {
    const [rules, posts, topics] = await Promise.all([
      resolver.value('blog.clusters', { storeId }),
      db.blogPost.findMany({ where: { storeId, archivedAt: null }, take: LIST_MAX, select: { id: true, title: true, focusKeyword: true } }),
      db.blogTopic.findMany({ where: { storeId, archivedAt: null, postId: null, status: { not: 'rejected' } }, take: LIST_MAX, select: { id: true, title: true, query: true } }),
    ]);
    const a = closest(d.title, d.query, [...posts.map((p) => ({ kind: 'post' as const, id: p.id, title: p.title, query: p.focusKeyword })), ...topics.map((t) => ({ kind: 'topic' as const, id: t.id, title: t.title, query: t.query }))]);
    level = alikeLevel(a, rules);
    if (level === 'warn' && !d.force) throw new JournalError('ALIKE', 409, [a!.title]);
  }
  const fields = { title: d.title, query: d.query, locale: d.locale, clusterId: d.clusterId, priority: d.priority, isPillar: d.isPillar, pillar: d.pillar, authorId: autoAuthorId, keywords: d.query ? [d.query] : [] };
  let saved;
  let auto = false;
  if (before) saved = await db.blogTopic.update({ where: { id: before.id }, data: fields });
  else {
    // The publisher's own topic is decided as he writes it; anyone else's waits for him, or (PR 244, `blog.approval`
    // 'auto') is approved by itself. Each new topic joins its month's batch.
    const [owner, approval, timeZone] = await Promise.all([can(db, who.actor, 'blog.publish', { storeId }), resolver.value('blog.approval', { storeId }), resolver.value('store.timeZone', { storeId })]);
    const status = owner ? 'approved' : autoDecision(approval, level);
    auto = !owner && status === 'approved';
    saved = await db.blogTopic.create({
      data: { storeId, ...fields, source: 'staff', status, batchMonth: monthOf(now, timeZone), proposedById: who.actor.staffUserId ?? null, ...(status === 'approved' ? { approvedById: owner ? (who.actor.staffUserId ?? null) : null, decidedAt: now } : {}) },
    });
  }
  await audit(db, who.actor, { storeId, action: before ? 'blog.topic.save' : 'blog.topic.create', entityType: 'BlogTopic', entityId: saved.id, after: { title: saved.title, status: saved.status, clusterId: saved.clusterId } }, who.ctx);
  if (auto) await audit(db, who.actor, { storeId, action: 'blog.topic.auto', entityType: 'BlogTopic', entityId: saved.id, after: { title: saved.title, status: saved.status } }, who.ctx);
  return saved.id;
}

/**
 * Approve, reject, reopen, start writing, put away or restore a topic. PR 528: "Start writing" takes the brief's
 * language and keyword when the topic has one (the brief then points at the article), and with
 * `blog.brief.requireForStart` on it is refused (BRIEF_MISSING) until the brief is saved.
 */
export async function topicAction(db: Db, who: JournalWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S, resolver?: Resolver): Promise<{ postId: string | null }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = (TOPIC_ACTIONS as readonly string[]).includes(String(o.action)) ? (o.action as TopicAction) : null;
  if (!action) throw new JournalError('INVALID_INPUT', 400, ['action']);
  const need = TOPIC_PERMISSION[action];
  if (need !== 'blog.write' && !(await can(db, who.actor, need, { storeId }))) throw new JournalError('FORBIDDEN', 403, [need]);
  const t = await db.blogTopic.findFirst({ where: { id, storeId } });
  if (!t) throw new JournalError('NOT_FOUND', 404);
  if (t.updatedAt.toISOString() !== o.version) throw new JournalError('STALE', 409);
  const to = topicNext(action, { status: t.status, postId: t.postId, archived: !!t.archivedAt });
  if (!to) throw new JournalError('WRONG_STATE', 409);
  const brief = action === 'start' ? await db.blogBrief.findFirst({ where: { storeId, topicId: t.id } }) : null;
  if (action === 'start' && !brief && resolver && (await resolver.value('blog.brief', { storeId })).requireForStart) throw new JournalError('BRIEF_MISSING', 409);

  let postId: string | null = null;
  await db.$transaction(async (tx) => {
    const data: Prisma.BlogTopicUpdateInput = { status: to };
    if (action === 'approve' || action === 'reject') Object.assign(data, { approvedById: action === 'approve' ? (who.actor.staffUserId ?? null) : null, decidedAt: now });
    if (action === 'reopen') data.decidedAt = null;
    if (action === 'archive') data.archivedAt = now;
    if (action === 'restore') data.archivedAt = null;
    if (action === 'start') {
      const cluster = t.clusterId ? await tx.contentCluster.findFirst({ where: { id: t.clusterId, storeId, archivedAt: null } }) : null;
      // A link from the title (a Bengali title gets one from the topic, to be retyped in the editor), never taken twice.
      const base = slugify(t.title) || `article-${t.id.slice(-8)}`;
      const locale = brief?.language ?? t.locale;
      const taken = new Set((await tx.blogPost.findMany({ where: { storeId, locale, slug: { startsWith: base } }, select: { slug: true } })).map((p) => p.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      // PR 593: when its writer is one of the five AI authors, another of them proofreads — never itself — picked
      // by whoever is carrying the fewest open reviews right now, so the load stays even over time.
      let reviewerAuthorId: string | null = null;
      const writer = t.authorId ? await tx.blogAuthor.findFirst({ where: { id: t.authorId, storeId }, select: { isAiAuthor: true } }) : null;
      if (writer?.isAiAuthor) {
        const ai = await tx.blogAuthor.findMany({ where: { storeId, archivedAt: null, isAiAuthor: true }, orderBy: { agentKey: 'asc' }, select: { id: true, agentKey: true } });
        const loads = await Promise.all(ai.filter((a) => a.id !== t.authorId).map(async (a) => [a.id, await tx.blogPost.count({ where: { storeId, archivedAt: null, reviewerAuthorId: a.id } })] as const));
        reviewerAuthorId = pickReviewer(ai, t.authorId, new Map(loads));
      }
      const post = await tx.blogPost.create({
        data: { storeId, status: 'DRAFT', locale, slug, title: t.title, focusKeyword: brief?.query ?? brief?.keywords[0] ?? t.query, categoryId: cluster?.categoryId ?? null, authorId: t.authorId, reviewerAuthorId, clusterId: cluster?.id ?? null, topicId: t.id, writerStaffId: who.actor.staffUserId, sourceUrls: [], productIds: [] },
        select: { id: true },
      });
      postId = post.id;
      data.postId = post.id;
      if (brief) await tx.blogBrief.update({ where: { id: brief.id }, data: { postId: post.id } });
      if (cluster && t.isPillar && !cluster.pillarPostId) await tx.contentCluster.update({ where: { id: cluster.id }, data: { pillarPostId: post.id } });
    }
    await tx.blogTopic.update({ where: { id: t.id }, data });
  });
  await audit(db, who.actor, { storeId, action: `blog.topic.${action}`, entityType: 'BlogTopic', entityId: t.id, before: { status: t.status }, after: { status: to, ...(postId ? { postId } : {}) } }, who.ctx);
  return { postId };
}

/**
 * PUT {key: 'clusters' | 'approval', value, version}: the planner's link rules and alike levels, or (PR 244) the
 * approval queue's mode (`blog.publish`; audited).
 */
export async function saveClusterSettings(db: Db, resolver: Resolver, who: JournalWho, input: unknown, storeId: number = S): Promise<void> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'clusters' && o.key !== 'approval') throw new JournalError('INVALID_INPUT', 400, ['key']);
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const key = o.key === 'clusters' ? 'blog.clusters' : 'blog.approval';
  const before = await resolver.value(key, { storeId });
  if (o.version !== versionOf(before)) throw new JournalError('STALE', 409);
  const ok = (key === 'blog.clusters' ? blogClustersSchema : blogApprovalSchema).safeParse(o.value);
  if (!ok.success) throw new JournalError('INVALID_INPUT', 400, issuesOf(ok.error));
  if (versionOf(ok.data) === versionOf(before)) return;
  await resolver.set(key, ok.data as never, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Website › Blog & journal › Topic plan' });
  await audit(db, who.actor, { storeId, action: `${key}.settings`, entityType: 'Setting', entityId: key, before: { ...before }, after: { ...(ok.data as object) } }, who.ctx);
}

/**
 * PR 244: the owner's "Approve the whole batch" — every proposed topic of one month at once (`blog.publish`); a very
 * close one is held for his own yes or no. Answers how many were approved and held.
 */
export async function approveBatch(db: Db, resolver: Resolver, who: JournalWho, input: unknown, now: Date = new Date(), storeId: number = S): Promise<{ approved: number; held: number }> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const month = typeof o.month === 'string' && /^\d{4}-\d{2}$/.test(o.month) ? o.month : null;
  if (!month) throw new JournalError('INVALID_INPUT', 400, ['month']);
  if (!(await can(db, who.actor, 'blog.publish', { storeId }))) throw new JournalError('FORBIDDEN', 403, ['blog.publish']);
  const plan = await clusterPlan(db, resolver, now, storeId);
  const waiting = plan.queue.find((q) => q.month === month)?.topics ?? [];
  const { approve, held } = batchSplit(
    waiting.map((t) => ({ ...t, level: t.alike?.level ?? ('none' as const) })),
    month,
  );
  if (approve.length) {
    await db.blogTopic.updateMany({ where: { storeId, id: { in: approve.map((t) => t.id) }, status: 'proposed' }, data: { status: 'approved', approvedById: who.actor.staffUserId ?? null, decidedAt: now } });
  }
  await audit(db, who.actor, { storeId, action: 'blog.topic.batch', entityType: 'BlogTopic', entityId: month, after: { month, approved: approve.length, held: held.length } }, who.ctx);
  return { approved: approve.length, held: held.length };
}

/**
 * /api/admin/blog/{clusters,topics}[/<id>] — GET the plan (`blog.read`); POST a new cluster or topic (no id) or
 * {action, version} on one; PUT one, or (clusters, no id) the planner's card. Every answer carries the plan.
 */
export async function planHandler(request: Request, deps: AdminDeps | null, kind: 'clusters' | 'topics' | 'batch', id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  if (id && !isUuid(id)) return fail(404, 'NOT_FOUND');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'blog.read' : 'blog.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const resolver = deps!.resolver;
  const now = deps!.now?.() ?? new Date();
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    let extra: Record<string, unknown> = {};
    if (kind === 'batch') {
      if (method !== 'POST' || id) return fail(405, 'method-not-allowed');
      extra = await approveBatch(db, resolver, who, await body(request), now);
    } else if (method === 'PUT' && !id) {
      if (kind !== 'clusters') return fail(405, 'method-not-allowed');
      await saveClusterSettings(db, resolver, who, await body(request));
    } else if (method === 'PUT') {
      if (kind === 'clusters') await saveCluster(db, who, id, await body(request));
      else await saveTopic(db, resolver, who, id, await body(request), now);
    } else if (method === 'POST' && id) {
      if (kind === 'clusters') await clusterAction(db, who, id, await body(request), now);
      else extra = await topicAction(db, who, id, await body(request), now, S, resolver);
    } else if (method === 'POST') {
      if (kind === 'clusters') await saveCluster(db, who, null, await body(request));
      else await saveTopic(db, resolver, who, null, await body(request), now);
    }
    const plan = await clusterPlan(db, resolver, now);
    return json({ ok: true, plan, cards: { clusters: plan.card, approval: plan.approval }, ...extra }, { status: method === 'POST' && !id && kind !== 'batch' ? 201 : 200 });
  } catch (e) {
    return answer(e);
  }
}
