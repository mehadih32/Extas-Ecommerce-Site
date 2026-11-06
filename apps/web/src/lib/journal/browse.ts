// S12 · PR 592 follow-up (register "Blog as a complete, standard section of the shop … tags, author/reviewer pages,
// search … RSS"; demo 73-blog.js bfTag, bfAuthorPage, bfSearchPage, bfBrowse, bfRss) — what the journal's browsing pages
// read, live articles only (journal.ts liveWhere) of the page's language:
// - a tag's articles (newest first, one page) — `blog.journal.tags`;
// - a person's page: the articles they wrote and the ones they reviewed as the expert reviewer — `blog.journal.authorPages`;
// - the journal's search: the articles whose title, tags, keyword, topic, summary or text hold a word of the search,
//   best first (browse-model.ts rankMatches) — `blog.journal.search`;
// - the most used tags and the people with live articles ("More ways to browse" on the journal's first page);
// - the newest articles for the RSS feed — `blog.journal.rss`.
// Each switch is off as it ships; the pages answer "page not found" while theirs is off.
import { Prisma, type PrismaClient } from '@extas/db/client';
import { LIVE_SELECT, liveOf, liveWhere, type LivePost } from './journal';
import { rankMatches, searchWords } from './browse-model';

type Db = PrismaClient;
type Lang = 'en' | 'bn';
const order: Prisma.BlogPostOrderByWithRelationInput[] = [{ publishedAt: 'desc' }, { id: 'desc' }];
/** How many matching articles a search ranks at most (the newest first). */
const SEARCH_POOL = 200; // hardcode-ok: a list length, not a business number

export interface Paged {
  total: number;
  posts: LivePost[];
}

const skip = (page: number, perPage: number) => Math.max(0, page - 1) * perPage;

/** A tag by its link with one page of its live articles (null = no such tag). */
export async function liveByTag(db: Db, storeId: number, locale: Lang, slug: string, page: number, perPage: number, now: Date = new Date()): Promise<(Paged & { tag: { slug: string; name: string } }) | null> {
  const tag = await db.blogTag.findFirst({ where: { storeId, slug }, select: { id: true, slug: true, name: true } });
  if (!tag) return null;
  const where: Prisma.BlogPostWhereInput = { ...liveWhere(storeId, locale, now), tags: { some: { tagId: tag.id } } };
  const [total, rows] = await Promise.all([db.blogPost.count({ where }), db.blogPost.findMany({ where, orderBy: order, skip: skip(page, perPage), take: perPage, select: LIVE_SELECT })]);
  return { tag: { slug: tag.slug, name: tag.name }, total, posts: rows.map(liveOf) };
}

export interface Person {
  slug: string;
  displayName: string;
  isAiAuthor: boolean;
  bio: string | null;
  reviewerLine: string | null;
}

/** A person's page: who they are, one page of the articles they wrote and the first ones they reviewed (null = none). */
export async function liveByPerson(db: Db, storeId: number, locale: Lang, slug: string, page: number, perPage: number, now: Date = new Date()): Promise<{ person: Person; written: Paged; reviewed: Paged } | null> {
  const a = await db.blogAuthor.findFirst({ where: { storeId, slug, archivedAt: null }, select: { id: true, slug: true, displayName: true, isAiAuthor: true, bioEn: true, bioBn: true, reviewerLine: true } });
  if (!a) return null;
  const live = liveWhere(storeId, locale, now);
  const wrote: Prisma.BlogPostWhereInput = { ...live, authorId: a.id };
  const checked: Prisma.BlogPostWhereInput = { ...live, reviewerAuthorId: a.id };
  const [wTotal, wRows, rTotal, rRows] = await Promise.all([
    db.blogPost.count({ where: wrote }),
    db.blogPost.findMany({ where: wrote, orderBy: order, skip: skip(page, perPage), take: perPage, select: LIVE_SELECT }),
    db.blogPost.count({ where: checked }),
    db.blogPost.findMany({ where: checked, orderBy: order, take: perPage, select: LIVE_SELECT }),
  ]);
  const bio = locale === 'bn' ? (a.bioBn ?? a.bioEn) : a.bioEn;
  return {
    person: { slug: a.slug, displayName: a.displayName, isAiAuthor: a.isAiAuthor, bio, reviewerLine: a.reviewerLine },
    written: { total: wTotal, posts: wRows.map(liveOf) },
    reviewed: { total: rTotal, posts: rRows.map(liveOf) },
  };
}

/** The journal's search: one page of the live articles that match, best first. No words = nothing. */
export async function searchJournal(db: Db, storeId: number, locale: Lang, q: string, page: number, perPage: number, now: Date = new Date()): Promise<Paged & { words: string[] }> {
  const words = searchWords(q);
  if (!words.length) return { words, total: 0, posts: [] };
  const has = (w: string): Prisma.BlogPostWhereInput[] => {
    const like = { contains: w, mode: 'insensitive' as const };
    return [{ title: like }, { excerpt: like }, { quickAnswer: like }, { body: like }, { focusKeyword: like }, { tags: { some: { tag: { name: like } } } }, { category: { OR: [{ nameEn: like }, { nameBn: like }] } }];
  };
  const rows = await db.blogPost.findMany({ where: { ...liveWhere(storeId, locale, now), AND: [{ OR: words.flatMap(has) }] }, orderBy: order, take: SEARCH_POOL, select: LIVE_SELECT });
  const ranked = rankMatches(rows.map(liveOf), words);
  return { words, total: ranked.length, posts: ranked.slice(skip(page, perPage), skip(page, perPage) + perPage) };
}

/** The tags used most by live articles of the language (at most `max`). */
export async function popularTags(db: Db, storeId: number, locale: Lang, max: number, now: Date = new Date()): Promise<{ slug: string; name: string; count: number }[]> {
  const rows = await db.blogPostTag.groupBy({ by: ['tagId'], where: { storeId, post: liveWhere(storeId, locale, now) }, _count: { _all: true }, orderBy: { _count: { tagId: 'desc' } }, take: max });
  if (!rows.length) return [];
  const tags = new Map((await db.blogTag.findMany({ where: { storeId, id: { in: rows.map((r) => r.tagId) } }, select: { id: true, slug: true, name: true } })).map((t) => [t.id, t]));
  return rows.flatMap((r) => {
    const t = tags.get(r.tagId);
    return t ? [{ slug: t.slug, name: t.name, count: r._count._all }] : [];
  });
}

/** The people (not put away) who wrote or reviewed a live article of the language, by name. */
export async function livePeople(db: Db, storeId: number, locale: Lang, now: Date = new Date()): Promise<{ slug: string; displayName: string; isAiAuthor: boolean }[]> {
  const live = liveWhere(storeId, locale, now);
  return db.blogAuthor.findMany({
    where: { storeId, archivedAt: null, OR: [{ posts: { some: live } }, { reviewedPosts: { some: live } }] },
    orderBy: { displayName: 'asc' },
    select: { slug: true, displayName: true, isAiAuthor: true },
  });
}

/** The newest live articles of the language for the RSS feed (at most `max`). */
export async function rssPosts(db: Db, storeId: number, locale: Lang, max: number, now: Date = new Date()): Promise<LivePost[]> {
  const rows = await db.blogPost.findMany({ where: liveWhere(storeId, locale, now), orderBy: order, take: max, select: LIVE_SELECT });
  return rows.map(liveOf);
}
