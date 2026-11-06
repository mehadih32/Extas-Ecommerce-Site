// S12 · PR 242 (Blueprint C4.5, C11.2; demo 94-admin-blog.js topics tab, zb_dupFind) — the topical cluster planner,
// pure: which articles to write (planned topics) and how the articles of a cluster must link.
//
// - A cluster is one subject with a pillar article (the long guide) and its supporting articles, all pointing at one
//   shop page (a collection or a product). The links an article must carry (`blog.clusters`): a supporting article to
//   its pillar and to the shop page; the pillar to every live supporting article. `clusterGaps` lists what is missing.
// - A topic is compared word by word (title, and title with the search phrase) with every article and open topic: the
//   closest one and how alike it is, in whole per cent (`closest`), so the planner can say "a little alike" or "very
//   close" from the setting's two levels.
import { z } from 'zod';
import { ROUTES } from '../shop/routes';
import { blocks, type Inline } from './blocks';
import { TITLE_MAX } from './model';

// ---- links ----

/** A shop path as the link checks compare it: no query or anchor, no trailing slash, the Bengali `/bn` prefix off. */
export function normPath(href: string): string | null {
  if (!/^\/(?!\/)/.test(href)) return null;
  let p = href.split(/[?#]/)[0] ?? '';
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep as written */
  }
  p = p.replace(/\/+$/, '') || '/';
  if (p === '/bn') return '/';
  if (p.startsWith('/bn/')) p = p.slice(3);
  return p.toLowerCase();
}

/** Every link inside the shop an article's words carry (paragraphs, lists and boxes), compared as `normPath`. */
export function linksOf(body: string | null): Set<string> {
  const out = new Set<string>();
  const add = (xs: Inline[]) => {
    for (const x of xs) {
      if (x.t !== 'a') continue;
      const n = normPath(x.href);
      if (n) out.add(n);
    }
  };
  for (const b of blocks(body ?? '')) {
    if (b.t === 'p' || b.t === 'box') add(b.s);
    else if (b.t === 'ul' || b.t === 'ol') b.items.forEach(add);
  }
  return out;
}

export interface LinkRules {
  linkPillar: boolean;
  linkTarget: boolean;
  pillarLinksAll: boolean;
}
export interface ClusterPost {
  id: string;
  slug: string;
  title: string;
  body: string | null;
  live: boolean;
}
export type LinkGap = { kind: 'pillar' | 'target' | 'support'; path: string; title?: string };

/** The links each article of a cluster still lacks (only articles with a gap are in the map). */
export function clusterGaps(c: { pillarPostId: string | null; targetPath: string | null }, posts: ClusterPost[], rules: LinkRules): Map<string, LinkGap[]> {
  const out = new Map<string, LinkGap[]>();
  const pillar = c.pillarPostId ? (posts.find((p) => p.id === c.pillarPostId) ?? null) : null;
  const target = c.targetPath ? normPath(c.targetPath) : null;
  const supports = posts.filter((p) => p.id !== pillar?.id);
  const need = (p: ClusterPost, g: LinkGap) => {
    if (linksOf(p.body).has(normPath(g.path) ?? g.path)) return;
    out.set(p.id, [...(out.get(p.id) ?? []), g]);
  };
  for (const p of supports) {
    if (rules.linkPillar && pillar) need(p, { kind: 'pillar', path: ROUTES.article(pillar.slug), title: pillar.title });
    if (rules.linkTarget && target) need(p, { kind: 'target', path: target });
  }
  if (pillar) {
    if (rules.linkTarget && target) need(pillar, { kind: 'target', path: target });
    if (rules.pillarLinksAll) for (const p of supports.filter((x) => x.live)) need(pillar, { kind: 'support', path: ROUTES.article(p.slug), title: p.title });
  }
  return out;
}

// ---- alike topics ----

/** Short joining words that say nothing about a subject (English; Bengali words all count). */
const STOP = new Set(['a', 'an', 'and', 'are', 'for', 'how', 'in', 'is', 'it', 'of', 'on', 'or', 'so', 'the', 'to', 'vs', 'what', 'when', 'which', 'why', 'with', 'your', 'you', 'do', 'does', 'can', 'my']);

export function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
};

export interface Comparable {
  kind: 'post' | 'topic';
  id: string;
  title: string;
  query: string | null;
}
export interface Alike {
  score: number;
  kind: 'post' | 'topic';
  id: string;
  title: string;
}

/** The closest article or topic to a title and its search phrase (score 0–100), or null when nothing shares a word. */
export function closest(title: string, query: string | null, pool: Comparable[], skipIds: readonly string[] = []): Alike | null {
  const a = tokens(title);
  const aq = tokens(`${title} ${query ?? ''}`);
  let best: Alike | null = null;
  for (const x of pool) {
    if (skipIds.includes(x.id)) continue;
    const s = Math.round(100 * Math.max(jaccard(a, tokens(x.title)), jaccard(aq, tokens(`${x.title} ${x.query ?? ''}`))));
    if (s > 0 && (!best || s > best.score)) best = { score: s, kind: x.kind, id: x.id, title: x.title };
  }
  return best;
}

export type AlikeLevel = 'none' | 'near' | 'warn';
export const alikeLevel = (a: Alike | null, s: { dupNear: number; dupWarn: number }): AlikeLevel => (!a ? 'none' : a.score >= s.dupWarn ? 'warn' : a.score >= s.dupNear ? 'near' : 'none');

// ---- topics ----

/** A topic's own states; while it has an article, the article's step shows instead. */
export const TOPIC_STATES = ['proposed', 'approved', 'rejected'] as const;
export type TopicState = (typeof TOPIC_STATES)[number];
export const TOPIC_ACTIONS = ['approve', 'reject', 'reopen', 'start', 'archive', 'restore'] as const;
export type TopicAction = (typeof TOPIC_ACTIONS)[number];
/** Deciding which topics get written is the owner's (the publisher's key); the rest is the writer's. */
export const TOPIC_PERMISSION: Record<TopicAction, 'blog.write' | 'blog.publish'> = {
  approve: 'blog.publish',
  reject: 'blog.publish',
  reopen: 'blog.write',
  start: 'blog.write',
  archive: 'blog.write',
  restore: 'blog.write',
};

/** Where a topic goes on an action, or null when the action does not apply (an archived topic only restores). */
export function topicNext(action: TopicAction, t: { status: string; postId: string | null; archived: boolean }): TopicState | null {
  const s = t.status as TopicState;
  if (t.archived) return action === 'restore' ? s : null;
  switch (action) {
    case 'approve':
      return s === 'proposed' || s === 'rejected' ? 'approved' : null;
    case 'reject':
      return (s === 'proposed' || s === 'approved') && !t.postId ? 'rejected' : null;
    case 'reopen':
      return s === 'rejected' ? 'proposed' : null;
    case 'start':
      return s === 'approved' && !t.postId ? 'approved' : null;
    case 'archive':
      return t.postId ? null : s;
    case 'restore':
      return null;
  }
}

export const PRIORITIES = [1, 2, 3] as const;
const uuid = z.uuid();
const nullUuid = uuid.nullish().transform((v) => v ?? null);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
export const QUERY_MAX = 160; // hardcode-ok: a field length
export const PATH_MAX = 200; // hardcode-ok: a field length
export const KEYWORDS_MAX = 12; // hardcode-ok: a list length

export const topicInputSchema = z
  .object({
    version: z.string().optional(),
    title: z.string().trim().min(3).max(TITLE_MAX),
    query: optText(QUERY_MAX),
    locale: z.enum(['en', 'bn']),
    clusterId: nullUuid,
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    isPillar: z.boolean().default(false),
    authorId: nullUuid,
    /** Add it although a very close article or topic exists (the second press). */
    force: z.boolean().optional(),
  })
  .strict();
export type TopicInput = z.output<typeof topicInputSchema>;

export const clusterInputSchema = z
  .object({
    version: z.string().optional(),
    name: z.string().trim().min(1).max(80),
    nameBn: optText(80),
    categoryId: nullUuid,
    /** The shop page its articles link to: a path inside the shop, or none. */
    targetPath: z
      .string()
      .trim()
      .max(PATH_MAX)
      .nullish()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^\/(?!\/)[^\s]*$/.test(v)),
    keywords: z.array(z.string().trim().min(1).max(60)).max(KEYWORDS_MAX).default([]),
    sortOrder: z.int().min(0).max(9999).default(0),
  })
  .strict();
export type ClusterInput = z.output<typeof clusterInputSchema>;
