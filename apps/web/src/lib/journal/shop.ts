// S12 · PR 241 (Blueprint C11.4, demo 73-blog.js) — what the shop's journal pages read: the switch and numbers
// (`blog.journal`), the live articles of the page's language (one page of the list, a topic's with its sub-topics, one
// article) and the products an article's product block shows (only ones a customer may see now, at most the number set).
// ~~The journal pages are never listed by search engines yet (no page kind until PR 249, Article SEO).~~
// S12 · PR 249: an article also reads its live twin in the other language (hreflang) and "Read next" (internal links:
// its plan's articles, then its topic's; `blog.journal.relatedArticles`, 0 as shipped). The journal's own page kind in
// `seo.indexing` (off as shipped) decides whether search engines may list it.
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { liveCardsByIds, type ShopCard } from '@/lib/shop/catalogue';
import { readPageSettings, type ShopContext } from '@/lib/shop/context';
import { liveCategories, liveJournal, livePost, liveRelated, liveTwinSlug, type LivePost } from './journal';

export const journalSettings = async (storeId: number) => (await readPageSettings(['blog.journal'] as const, storeId))['blog.journal'];

/** A page number from the address (?page=2); anything else is the first page. */
export function pageOf(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1; // hardcode-ok: a sanity bound on an address, not a business number
}

export type Topic = Awaited<ReturnType<typeof liveCategories>>[number];

/** One page of the list (a topic's when `topicSlug` is given; null = no such topic). */
export async function journalPage(c: ShopContext, page: number, topicSlug: string | null) {
  const db = getPrisma();
  const [s, topics] = await Promise.all([journalSettings(c.storeId), liveCategories(db, c.storeId)]);
  const topic = topicSlug ? (topics.find((x) => x.slug === topicSlug) ?? null) : null;
  if (topicSlug && !topic) return null;
  const categoryIds = topic ? [topic.id, ...topics.filter((x) => x.parentId === topic.id).map((x) => x.id)] : undefined;
  const { total, posts } = await liveJournal(db, c.storeId, c.lang, { categoryIds, page, perPage: s.perPage });
  return { settings: s, topics, topic, total, posts, page, pages: Math.max(1, Math.ceil(total / s.perPage)) };
}

export interface JournalArticleData {
  post: LivePost;
  cards: ShopCard[];
  settings: Awaited<ReturnType<typeof journalSettings>>;
  /** PR 249: the live twin's link in the other language (null = none). */
  twin: string | null;
  /** PR 249: "Read next" (`blog.journal.relatedArticles` at most; none while it is 0). */
  related: LivePost[];
}

/** One live article in the page's language with its product block's cards, its twin and "Read next" (null = none). */
export const journalArticle = cache(async (c: ShopContext, slug: string): Promise<JournalArticleData | null> => {
  const db = getPrisma();
  const [s, post] = await Promise.all([journalSettings(c.storeId), livePost(db, c.storeId, c.lang, slug)]);
  if (!post) return null;
  const [cards, twin, related] = await Promise.all([
    s.relatedProducts > 0 && post.productIds.length ? liveCardsByIds(c.storeId, post.productIds).then((l) => l.slice(0, s.relatedProducts)) : Promise.resolve([]),
    liveTwinSlug(db, c.storeId, post),
    liveRelated(db, c.storeId, post, s.relatedArticles),
  ]);
  return { post, cards, settings: s, twin, related };
});

/** Whether the other language has a live article at this link (the language switch's target). */
export async function journalHasOther(c: ShopContext, slug: string): Promise<boolean> {
  return !!(await livePost(getPrisma(), c.storeId, c.lang === 'bn' ? 'en' : 'bn', slug));
}
