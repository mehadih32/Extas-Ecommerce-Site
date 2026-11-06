// S12 · PR 239 (Blueprint C11, WEB-03; demo 73-blog.js, 94-admin-blog.js) — the journal's articles, pure: their publish
// states and the moves between them, the board's columns, the link (slug), the words and the reading time, the inputs
// the admin sends and the honest byline.
//
// States (BlogPostStatus): an idea (IDEA, BRIEFED) is written (DRAFT), then passes three review steps one by one —
// proofread (PROOFREAD), business facts (FACT_CHECKED), SEO (SEO_CHECKED) — and is then scheduled (SCHEDULED) or
// published (PUBLISHED). A published article can be taken down (UNPUBLISHED) and put back. Anything not live can be put
// away (ARCHIVED) and restored as a draft: nothing is ever deleted. An edit of the words of an article under review or
// scheduled sends it back to writing (C11.2 "an edit sends the post back to proof"); an edit of a published article
// keeps it live and marks it updated (the "updated" date only on a real edit). A scheduled article is live from its
// time on, with no job needed (the shop reads it as published once its time has come).
import { z } from 'zod';

export const BLOG_STATES = ['IDEA', 'BRIEFED', 'DRAFT', 'PROOFREAD', 'FACT_CHECKED', 'SEO_CHECKED', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'] as const;
export type BlogState = (typeof BLOG_STATES)[number];

/** The board's columns (WEB-03 "Ideas → Writing → Review → Scheduled → Published"), plus taken down and put away. */
export const BLOG_COLUMNS = ['ideas', 'writing', 'review', 'scheduled', 'published', 'off', 'archived'] as const;
export type BlogColumn = (typeof BLOG_COLUMNS)[number];
export const COLUMN_OF: Record<BlogState, BlogColumn> = {
  IDEA: 'ideas',
  BRIEFED: 'ideas',
  DRAFT: 'writing',
  PROOFREAD: 'review',
  FACT_CHECKED: 'review',
  SEO_CHECKED: 'review',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  UNPUBLISHED: 'off',
  ARCHIVED: 'archived',
};

/** The three review steps in order: the step a pass completes from each state. */
export const REVIEW_STEP: Partial<Record<BlogState, { stage: 'proof' | 'facts' | 'seo'; to: BlogState }>> = {
  DRAFT: { stage: 'proof', to: 'PROOFREAD' },
  PROOFREAD: { stage: 'facts', to: 'FACT_CHECKED' },
  FACT_CHECKED: { stage: 'seo', to: 'SEO_CHECKED' },
};

export const BLOG_ACTIONS = ['write', 'pass', 'back', 'schedule', 'unschedule', 'publish', 'unpublish', 'archive', 'restore'] as const;
export type BlogAction = (typeof BLOG_ACTIONS)[number];

/** Who may do an action: writers (`blog.write`) or publishers (`blog.publish`). */
export const ACTION_PERMISSION: Record<BlogAction, 'blog.write' | 'blog.publish'> = {
  write: 'blog.write',
  pass: 'blog.write',
  back: 'blog.write',
  schedule: 'blog.publish',
  unschedule: 'blog.publish',
  publish: 'blog.publish',
  unpublish: 'blog.publish',
  archive: 'blog.write',
  restore: 'blog.write',
};

/** The state an action moves an article to from `from`, or null when it cannot (the server refuses WRONG_STATE). */
export function nextState(action: BlogAction, from: BlogState): BlogState | null {
  switch (action) {
    case 'write':
      return from === 'IDEA' || from === 'BRIEFED' ? 'DRAFT' : null;
    case 'pass':
      return REVIEW_STEP[from]?.to ?? null;
    case 'back':
      return from === 'PROOFREAD' || from === 'FACT_CHECKED' || from === 'SEO_CHECKED' || from === 'SCHEDULED' || from === 'UNPUBLISHED' ? 'DRAFT' : null;
    case 'schedule':
      return from === 'SEO_CHECKED' ? 'SCHEDULED' : null;
    case 'unschedule':
      return from === 'SCHEDULED' ? 'SEO_CHECKED' : null;
    case 'publish':
      return from === 'SEO_CHECKED' || from === 'SCHEDULED' || from === 'UNPUBLISHED' ? 'PUBLISHED' : null;
    case 'unpublish':
      return from === 'PUBLISHED' ? 'UNPUBLISHED' : null;
    case 'archive':
      return from === 'PUBLISHED' || from === 'ARCHIVED' ? null : 'ARCHIVED';
    case 'restore':
      return from === 'ARCHIVED' ? 'DRAFT' : null;
  }
}

/** The actions open on an article in a state (the editor shows only these buttons). */
export const actionsFor = (s: BlogState): BlogAction[] => BLOG_ACTIONS.filter((a) => nextState(a, s) !== null);

/** States in which an edit of the words sends the article back to writing. */
const BACK_ON_EDIT: readonly BlogState[] = ['PROOFREAD', 'FACT_CHECKED', 'SEO_CHECKED', 'SCHEDULED'];
export const editSendsBack = (s: BlogState) => BACK_ON_EDIT.includes(s);

/** Is the article on the shop now: published, or scheduled and its time has come; never when put away. */
export function isLive(p: { status: BlogState; scheduledAt: Date | null; archivedAt: Date | null }, now: Date): boolean {
  if (p.archivedAt) return false;
  if (p.status === 'PUBLISHED') return true;
  return p.status === 'SCHEDULED' && !!p.scheduledAt && p.scheduledAt.getTime() <= now.getTime();
}

// ---- the link and the words ----

export const SLUG_MAX = 80; // hardcode-ok: the length of a link, not a business number
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A link from a title: Latin letters and digits only (a Bengali title needs a link typed in Latin letters). */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');

/**
 * PR 592 follow-up — the journal's own pages under /journal/… that an article's link may not take (the address would
 * open the page, never the article).
 */
export const RESERVED_SLUGS: readonly string[] = ['topic', 'tag', 'author', 'search'];

/** PR 592 follow-up — tags: at most this many on one article, each at most this long. */
export const TAGS_MAX = 12; // hardcode-ok: a list length, not a business number
export const TAG_MAX = 40; // hardcode-ok: the length of a word, not a business number

/** One tag as it is kept: spaces folded, no leading "#". */
export const tagName = (s: string) => s.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX);

/**
 * A tag's link: its Latin letters and digits (slugify), else (a Bengali tag) "t-" and a short hash of its name, so a
 * tag's address never carries Bengali letters and the same name always gets the same link.
 */
export function tagSlug(name: string): string {
  const latin = slugify(name);
  if (latin) return latin;
  let h = 0x811c9dc5; // FNV-1a, 32 bit — hardcode-ok: the hash's own constants
  for (const ch of name.toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193); // hardcode-ok
  }
  return `t-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/** The tags typed (a list or one line split at commas): kept once each by their link, in the order typed. */
export function tagList(input: readonly string[] | string): { name: string; slug: string }[] {
  const raw = typeof input === 'string' ? input.split(/[,،]/) : input;
  const out: { name: string; slug: string }[] = [];
  for (const x of raw) {
    const name = tagName(x);
    if (!name) continue;
    const slug = tagSlug(name);
    if (!out.some((t) => t.slug === slug)) out.push({ name, slug });
  }
  return out;
}

/** The article's words, without the figure and product-block markers and the format signs (Bengali counted alike). */
export function wordCount(body: string): number {
  return body
    .replace(/\[(fig|products)[^\]]*\]/g, ' ')
    .replace(/[#>*_`|-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Reading time in whole minutes: words over the language's reading speed, never less than the shortest time. */
export function readingMinutes(words: number, locale: 'en' | 'bn', s: { wordsPerMinuteEn: number; wordsPerMinuteBn: number; minMinutes: number }): number {
  return Math.max(s.minMinutes, Math.round(words / (locale === 'bn' ? s.wordsPerMinuteBn : s.wordsPerMinuteEn)));
}

// ---- the inputs the admin sends ----

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const TITLE_MAX = 160; // hardcode-ok: field lengths, not business numbers
export const EXCERPT_MAX = 300; // hardcode-ok
export const META_MAX = 200; // hardcode-ok
export const BODY_MAX = 100_000; // hardcode-ok
export const PRODUCTS_MAX = 8; // hardcode-ok: the product block's longest list (the setting picks how many show)

export const postInputSchema = z
  .object({
    /** The version the article was read at (an edit); a new article sends none. */
    version: z.string().optional(),
    locale: z.enum(['en', 'bn']),
    title: text(TITLE_MAX).min(1),
    /** Empty = made from the title (an English title); a Bengali title needs one typed. */
    slug: z.string().trim().max(SLUG_MAX).optional().default(''),
    excerpt: optText(EXCERPT_MAX),
    body: z.string().max(BODY_MAX).default(''),
    categoryId: uuid.nullish().transform((v) => v ?? null),
    authorId: uuid.nullish().transform((v) => v ?? null),
    metaDescription: optText(META_MAX),
    focusKeyword: optText(80),
    quickAnswer: optText(EXCERPT_MAX),
    heroAssetId: uuid.nullish().transform((v) => v ?? null),
    productIds: z
      .array(uuid)
      .max(PRODUCTS_MAX)
      .default([])
      .refine((a) => new Set(a).size === a.length),
    featured: z.boolean().default(false),
    /** PR 592 follow-up: the expert reviewer (an author record, never the article's own author). */
    reviewerAuthorId: uuid.nullish().transform((v) => v ?? null),
    /** PR 592 follow-up: the article's tags (names; their links are made from them). */
    tags: z.array(z.string().max(TAG_MAX * 2)).max(TAGS_MAX * 2).default([]),
  })
  .strict();
export type PostInput = z.output<typeof postInputSchema>;

/** The link an input ends up with, or null when none can be made (a Bengali title and no link typed). */
export function slugOf(input: Pick<PostInput, 'slug' | 'title'>): string | null {
  const s = input.slug ? input.slug.toLowerCase() : slugify(input.title);
  return s && SLUG_RE.test(s) && !RESERVED_SLUGS.includes(s) ? s : null;
}

export const categoryInputSchema = z
  .object({
    version: z.string().optional(),
    slug: z.string().trim().toLowerCase().max(SLUG_MAX).regex(SLUG_RE),
    nameEn: text(80).min(1),
    nameBn: optText(80),
    introEn: optText(600),
    introBn: optText(600),
    /** A sub-category's main category (a main category has none; only two levels). */
    parentId: uuid.nullish().transform((v) => v ?? null),
    sortOrder: z.int().min(0).max(9999).default(0),
  })
  .strict();
export type CategoryInput = z.output<typeof categoryInputSchema>;

export const authorInputSchema = z
  .object({
    version: z.string().optional(),
    slug: z.string().trim().toLowerCase().max(SLUG_MAX).regex(SLUG_RE),
    displayName: text(80).min(1),
    /** An AI author is always labelled as one (C11.3: no invented human personas). */
    isAiAuthor: z.boolean(),
    bioEn: optText(600),
    bioBn: optText(600),
    /** A real staff reviewer's line, only where the owner enters a name (Note 31.3). */
    reviewerLine: optText(120),
  })
  .strict();
export type AuthorInput = z.output<typeof authorInputSchema>;

/** Which input fields were wrong (the screens show a word for each). */
export const issuesOf = (e: z.ZodError) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];

/** What the article still lacks before it can be published (each a word on the screen). */
export function publishGaps(p: { title: string; body: string | null; slug: string }): string[] {
  const gaps: string[] = [];
  if (!p.title.trim()) gaps.push('title');
  if (!p.slug) gaps.push('slug');
  if (!p.body || wordCount(p.body) === 0) gaps.push('body');
  return gaps;
}

/** The honest byline (C11.3): the author's name, and for an AI author the owner's line or the shop's own words. */
export function byline(
  author: { displayName: string; isAiAuthor: boolean; reviewerLine: string | null } | null,
  locale: 'en' | 'bn',
  aiNote: { en: string; bn: string },
  defaultNote: string,
): { name: string | null; ai: boolean; note: string | null; reviewer: string | null } {
  if (!author) return { name: null, ai: false, note: null, reviewer: null };
  return { name: author.displayName, ai: author.isAiAuthor, note: author.isAiAuthor ? aiNote[locale] || defaultNote : null, reviewer: author.reviewerLine };
}
