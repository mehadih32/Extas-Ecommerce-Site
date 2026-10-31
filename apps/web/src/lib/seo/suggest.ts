// S11 · PR 235 — the pure helpers of the redirect manager: the closest live page for an address that has none (the 404
// report's one-click fix), the same combo asked for with its colours in another order, the CSV of old links the owner
// imports (the WordPress map, PR 587), and the addresses a redirect may never take over (a page the shop has itself).
import { ROUTES } from '../shop/routes';
import { redirectKey } from './redirect-table';

/** Words that say nothing about which page it was (the old shop's folders, file endings, sizes as single letters). */
const NOISE = new Set(['p', 'product', 'products', 'shop', 'store', 'collections', 'collection', 'category', 'product-category', 'tag', 'html', 'php', 'www', 'bn', 'en', 'the', 'and', 'of', 'for']);

/** The words of an address: lower case, split on anything that is not a letter or a digit, noise dropped. */
export function wordsOf(path: string): string[] {
  return redirectKey(path)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !NOISE.has(w));
}

export interface Candidate {
  /** The live page's address. */
  path: string;
  /** Its name, shown beside the suggestion. */
  label: string;
}

/**
 * The live page whose address shares the most words with `path`, when at least `minPercent` of the address's words are
 * in it (ties: the page with fewer words of its own, then the first). Null when nothing is close enough.
 */
export function suggestTarget(path: string, candidates: readonly Candidate[], minPercent: number): (Candidate & { percent: number }) | null {
  const asked = [...new Set(wordsOf(path))];
  if (asked.length === 0) return null;
  let best: (Candidate & { percent: number; extra: number }) | null = null;
  for (const c of candidates) {
    const own = new Set(wordsOf(c.path));
    if (own.size === 0) continue;
    const shared = asked.filter((w) => own.has(w)).length;
    const percent = Math.round((shared / asked.length) * 100);
    const extra = own.size - shared;
    if (percent < minPercent || shared === 0) continue;
    if (!best || percent > best.percent || (percent === best.percent && extra < best.extra)) best = { ...c, percent, extra };
  }
  if (!best) return null;
  return { path: best.path, label: best.label, percent: best.percent };
}

/** A combo slug's colour words in a fixed order (`rule~black-navy` and `rule~navy-black` give the same key). */
export function colourSetKey(slug: string): string | null {
  const i = slug.indexOf('~');
  if (i <= 0) return null;
  const words = slug
    .slice(i + 1)
    .toLowerCase()
    .split(/[-.]+/)
    .filter(Boolean)
    .sort();
  return words.length >= 2 ? `${slug.slice(0, i).toLowerCase()}~${words.join('-')}` : null;
}

/**
 * The combo that `asked` names with its colours in another order: the one candidate slug of the same rule with the same
 * colour words. Null when there is none, or more than one (never a guess).
 */
export function sameColoursSlug(asked: string, candidates: readonly string[]): string | null {
  const key = colourSetKey(asked);
  if (!key) return null;
  const hits = candidates.filter((s) => s !== asked && colourSetKey(s) === key);
  return hits.length === 1 ? hits[0]! : null;
}

/** First segments that are the shop's own pages: an old link may never take one over (from the routing table). */
const OWN_FAMILIES: readonly string[] = [...new Set([ROUTES.bag, ROUTES.checkout, ROUTES.account, ROUTES.search, ROUTES.combos, ROUTES.bulkOrder, ROUTES.payLink('x'), ROUTES.journal].map((p) => p.split('/')[1]!))];

/** The home page, or an address in a family of the shop's own pages (the bag, checkout, account, search, sets …). */
export function isOwnAddress(path: string): boolean {
  const key = redirectKey(path);
  if (key === '/') return true;
  const first = key.split('/')[1] ?? '';
  return first === 'bn' || OWN_FAMILIES.includes(first);
}

export interface ImportRow {
  line: number;
  from: string;
  to: string;
}

/**
 * The owner's list of old links: one per line, the old address then the new one, split by a comma, a semicolon or a
 * tab; a full address (https://old-shop/…) is cut to its path; a first line that is a heading is skipped; empty lines
 * and lines starting with # are skipped. Lines with one column are returned with an empty `to` (the check says so).
 */
export function parseRedirectCsv(text: string): ImportRow[] {
  const out: ImportRow[] = [];
  const lines = String(text ?? '').split(/\r?\n/);
  let first = true;
  lines.forEach((raw, i) => {
    const line = raw.replace(/^﻿/, '').trim();
    if (!line || line.startsWith('#')) return;
    const cols = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim());
    const [from = '', to = ''] = cols;
    const looksLikeAddress = (v: string) => v.startsWith('/') || /^https?:\/\//i.test(v);
    const heading = first && !looksLikeAddress(from); // a heading such as "old,new"
    first = false;
    if (!heading) out.push({ line: i + 1, from, to });
  });
  return out;
}
