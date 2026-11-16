// PR 968 (prototype v5, Products › one product › "Google search look (SEO)"): the SEO score out of 100 and the tips under it.
// A pure function: the same words give the same score. The limits are the prototype's (title 30-60 letters, description
// 120-160, a short link, a photo for each colour); the search word to look for is the category's own name.
export interface SeoInput {
  title: string;
  description: string;
  slug: string;
  /** Words people search for in this category (the category's name); the first one must appear in the title or description. */
  keyword: string | null;
  photos: number;
  colours: number;
}

export type SeoTip = 'title' | 'description' | 'keyword' | 'place' | 'slug' | 'photos';

export interface SeoScore {
  score: number;
  band: 'good' | 'ok' | 'weak';
  tips: { key: SeoTip; keyword?: string }[];
}

/** The cuts of the prototype: 15, 20, 15, 10, 5 and 10 points. */
/** The words that say the text names the place the shop sells in (the Google checks of the product form and the wizard). */
export const PLACE_WORDS = /bangladesh|\bbd\b|dhaka|বাংলাদেশ|ঢাকা/i;

const COST: Record<SeoTip, number> = { title: 15, description: 20, keyword: 15, place: 10, slug: 5, photos: 10 };
const TITLE: [number, number] = [30, 60];
const DESC: [number, number] = [120, 160];
const SLUG_MAX = 45;
const FLOOR = 10;
const GOOD = 80;
const OK = 60;

export function seoScore(i: SeoInput): SeoScore {
  const tips: SeoScore['tips'] = [];
  const title = i.title.trim();
  const desc = i.description.trim();
  if (title.length < TITLE[0] || title.length > TITLE[1]) tips.push({ key: 'title' });
  if (desc.length < DESC[0] || desc.length > DESC[1]) tips.push({ key: 'description' });
  const kw = (i.keyword ?? '').trim().toLowerCase();
  const first = kw.split(/\s+/)[0] ?? '';
  if (first && !`${title} ${desc}`.toLowerCase().includes(first)) tips.push({ key: 'keyword', keyword: kw });
  if (!PLACE_WORDS.test(desc)) tips.push({ key: 'place' });
  if (i.slug.length > SLUG_MAX) tips.push({ key: 'slug' });
  if (i.photos < i.colours) tips.push({ key: 'photos' });
  const score = Math.max(FLOOR, 100 - tips.reduce((n, x) => n + COST[x.key], 0));
  return { score, band: score >= GOOD ? 'good' : score >= OK ? 'ok' : 'weak', tips };
}
