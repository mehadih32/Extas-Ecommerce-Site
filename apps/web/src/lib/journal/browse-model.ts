// S12 · PR 592 follow-up (register "Blog as a complete, standard section of the shop … tags, author/reviewer pages,
// search … RSS"; demo 73-blog.js bfSearchPage, bfRss) — the journal's browsing helpers, without the database: the words
// of a search, how well an article matches them (its title counts most, then its tags and topic, its summary, its text;
// demo bfSearchPage), and the RSS 2.0 file of the newest articles.

/** The longest search the journal takes, in characters, and the fewest. */
export const QUERY_MAX = 80; // hardcode-ok: the length of a search box, not a business number
export const QUERY_MIN = 2; // hardcode-ok: one letter finds everything; two is the least that means something

/** The words of a search (lower case, at most a handful, each at least QUERY_MIN long); none = no search. */
export function searchWords(q: string | null | undefined): string[] {
  const text = String(q ?? '')
    .slice(0, QUERY_MAX)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s-]+/gu, ' ');
  const words = [...new Set(text.split(/\s+/).filter((w) => w.length >= QUERY_MIN))];
  return words.slice(0, 6); // hardcode-ok: the most words one search looks for
}

/** What a search reads of an article. */
export interface Searchable {
  title: string;
  excerpt: string | null;
  quickAnswer: string | null;
  body: string;
  focusKeyword: string | null;
  tags: readonly { name: string }[];
  category: { nameEn: string; nameBn: string | null } | null;
}

/** How well an article matches the words (0 = not at all): title 5, tags / keyword / topic 3, summary 2, text 1 a word. */
export function matchScore(p: Searchable, words: readonly string[]): number {
  const title = p.title.toLowerCase();
  const tagged = [...p.tags.map((t) => t.name), p.focusKeyword ?? '', p.category?.nameEn ?? '', p.category?.nameBn ?? ''].join(' ').toLowerCase();
  const summary = `${p.excerpt ?? ''} ${p.quickAnswer ?? ''}`.toLowerCase();
  const body = p.body.toLowerCase();
  let s = 0;
  for (const w of words) {
    if (title.includes(w)) s += 5;
    if (tagged.includes(w)) s += 3;
    if (summary.includes(w)) s += 2;
    if (body.includes(w)) s += 1;
  }
  return s;
}

/** The articles that match, best first (newest first among equals). */
export function rankMatches<T extends Searchable & { publishedAt: string | null }>(posts: readonly T[], words: readonly string[]): T[] {
  if (!words.length) return [];
  return posts
    .map((p) => ({ p, s: matchScore(p, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || String(b.p.publishedAt ?? '').localeCompare(String(a.p.publishedAt ?? '')))
    .map((x) => x.p);
}

export interface RssItem {
  title: string;
  /** The article, absolute. */
  link: string;
  description: string | null;
  /** ISO time. */
  published: string | null;
  category: string | null;
  author: string | null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** The RSS 2.0 file of the journal (a reader such as Feedly shows new articles from it by itself). */
export function rssXml(head: { title: string; link: string; self: string; description: string; lang: 'en' | 'bn' }, items: readonly RssItem[]): string {
  const tag = (name: string, value: string | null) => (value ? `<${name}>${esc(value)}</${name}>` : '');
  const date = (iso: string | null) => (iso ? new Date(iso).toUTCString() : null);
  const lines = items.map(
    (i) =>
      `<item>${tag('title', i.title)}${tag('link', i.link)}<guid isPermaLink="true">${esc(i.link)}</guid>${tag('description', i.description)}` +
      `${tag('pubDate', date(i.published))}${tag('category', i.category)}${tag('dc:creator', i.author)}</item>`,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>` +
    `${tag('title', head.title)}${tag('link', head.link)}<atom:link href="${esc(head.self)}" rel="self" type="application/rss+xml"/>` +
    `${tag('description', head.description)}${tag('language', head.lang === 'bn' ? 'bn-BD' : 'en')}${tag('lastBuildDate', date(items[0]?.published ?? null))}\n${lines.join('\n')}\n</channel></rss>\n`
  );
}
