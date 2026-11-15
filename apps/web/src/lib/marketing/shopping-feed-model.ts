// Parity round 3, lane F6 · PR 866 (prototype v5 Marketing › Tools › Shopping feed, js/m-marketing.js `renderFeed` / `feedIssues`) — what
// the "Problems to fix" table lists, without the database: per live product of the feed, no description or no photo (Google rejects it),
// few photos or sold out (a warning). Read-only; the words come from the messages file by the key each problem carries.
import type { FeedProduct } from './merchant-feed-model';

/** The prototype's advice: four photos or more get more clicks. */
export const GOOD_PHOTOS = 4; // hardcode-ok: the prototype's rule of thumb for "few photos", shown in the problem text

export type FeedProblemKind = 'desc' | 'photo' | 'stock' | 'price';
export type FeedProblemSeverity = 'bad' | 'warn';

export interface FeedProblem {
  productId: string;
  title: string;
  kind: FeedProblemKind;
  severity: FeedProblemSeverity;
  /** The messages key under `sf.problem.` and its number (photos) for the words. */
  key: 'noDescription' | 'noPhoto' | 'fewPhotos' | 'soldOut' | 'noPrice';
  n: number;
}

/** Every problem of every product, in the order given (a product can have several). */
export function feedProblems(products: readonly FeedProduct[]): FeedProblem[] {
  const out: FeedProblem[] = [];
  for (const p of products) {
    const base = { productId: p.id, title: p.title };
    if (!(p.description ?? '').trim()) out.push({ ...base, kind: 'desc', severity: 'bad', key: 'noDescription', n: 0 });
    if (p.priceMinor == null || p.priceMinor <= 0) out.push({ ...base, kind: 'price', severity: 'bad', key: 'noPrice', n: 0 });
    if (!p.image) out.push({ ...base, kind: 'photo', severity: 'bad', key: 'noPhoto', n: 0 });
    else if ((p.photos ?? 0) < GOOD_PHOTOS) out.push({ ...base, kind: 'photo', severity: 'warn', key: 'fewPhotos', n: p.photos ?? 0 });
    if (!p.inStock) out.push({ ...base, kind: 'stock', severity: 'warn', key: 'soldOut', n: 0 });
  }
  return out;
}

/** Products Google would reject (a "bad" problem), the rest are approved. */
export function feedCounts(products: readonly FeedProduct[], problems: readonly FeedProblem[]): { live: number; rejected: number; approved: number } {
  const bad = new Set(problems.filter((x) => x.severity === 'bad').map((x) => x.productId));
  return { live: products.length, rejected: bad.size, approved: products.length - bad.size };
}

/** How many products still need a barcode answer: their brand is not marked as the shop's own. */
export function needBarcode(products: readonly FeedProduct[]): number {
  return products.filter((p) => !p.ownLabel).length;
}

/** The description a product with none gets: the shop's three sentences (name, category, size range), each only when the product has it. */
export function descriptionFrom(parts: { head: string; category: string; sizes: string }, p: { title: string; category: string | null; sizes: readonly string[] }): string {
  const range = p.sizes.length ? (p.sizes.length === 1 ? p.sizes[0]! : `${p.sizes[0]}-${p.sizes[p.sizes.length - 1]}`) : '';
  return [parts.head.replace('{name}', p.title), p.category ? parts.category.replace('{category}', p.category) : '', range ? parts.sizes.replace('{sizes}', range) : '']
    .filter(Boolean)
    .join(' ');
}
