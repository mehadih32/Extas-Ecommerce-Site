// S02 · PR 65 follow-up 232 — the shop's older reviews from a file (a CSV saved from a sheet), `source: IMPORT`.
// Every row is checked like a review the shop types in (addStaffReview's limits): a product of this store that is not archived (its
// link, or one of its SKUs), stars 1–5, words, a name the customer chose to show, the day it was written (never in the
// future). Every imported review lands PENDING — nothing is published by the import, so each one goes through the
// same check on Products › Reviews before anyone sees it — and none is marked a verified buyer (no order stands behind
// it; the mark stays the staff's own, by hand). A row already imported (same product, name, stars and words) is skipped,
// so a file sent twice adds nothing. `dryRun` checks the file and saves nothing. Needs `reviews.write`; each review is
// audited `reviews.import`. The file's size, rows and separator follow the catalogue's CSV settings (catalogue.csv.*).
import { z } from 'zod';
import { CatalogueError } from './errors';
import { allow, logChange, parse, setting, type CatalogueDeps, type Who } from './context';
import { CsvSyntaxError, readTable, uncell } from './csv';

/** The columns the file may carry (any order; unknown columns are ignored and named back). */
export const REVIEW_IMPORT_COLUMNS = ['product', 'rating', 'title', 'body', 'name', 'written', 'size', 'colour'] as const;
type Col = (typeof REVIEW_IMPORT_COLUMNS)[number];

/** Why a row is refused (stable codes; the screen turns them into words). */
export type ReviewImportProblem = 'NO_PRODUCT' | 'PRODUCT_UNKNOWN' | 'RATING' | 'NO_WORDS' | 'TOO_LONG' | 'DATE' | 'DUPLICATE';

export interface ReviewImportRow {
  line: number;
  ok: boolean;
  problems: ReviewImportProblem[];
  /** The product's link as found (for the screen). */
  product: string | null;
  rating: number | null;
}

export interface ReviewImportResult {
  dryRun: boolean;
  rows: ReviewImportRow[];
  /** Rows that pass (and were saved, when not a dry run). */
  ready: number;
  created: number;
  ignoredColumns: string[];
}

export const reviewImportSchema = z.object({ csv: z.string(), dryRun: z.boolean().default(true) }).strict();

const LIMITS = { title: 120, body: 5_000, name: 80, size: 40, colour: 60 } as const; // hardcode-ok: the same field lengths as staffReviewSchema
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A written-on day (YYYY-MM-DD) as a time, or null when the cell is not a real day. */
export function dayOf(v: string): Date | null {
  const m = DAY.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 6));
  return d.getUTCDate() === Number(m[3]) && d.getUTCMonth() === Number(m[2]) - 1 ? d : null;
}

/** One row's checks, without the database (the product is looked up by the caller). */
export function rowProblems(cell: (c: Col) => string, productFound: boolean, now: Date): ReviewImportProblem[] {
  const out: ReviewImportProblem[] = [];
  if (!cell('product')) out.push('NO_PRODUCT');
  else if (!productFound) out.push('PRODUCT_UNKNOWN');
  const r = cell('rating');
  if (!/^[1-5]$/.test(r)) out.push('RATING');
  if (!cell('body') && !cell('title')) out.push('NO_WORDS');
  if ((['title', 'body', 'name', 'size', 'colour'] as const).some((c) => [...cell(c)].length > LIMITS[c])) out.push('TOO_LONG');
  const w = cell('written');
  if (w && (!dayOf(w) || dayOf(w)!.getTime() > now.getTime())) out.push('DATE');
  return out;
}

export async function importReviews(deps: CatalogueDeps, who: Who, input: unknown): Promise<ReviewImportResult> {
  await allow(deps, who, 'reviews.write');
  const d = parse(reviewImportSchema, input, 'review import');
  const [maxRows, maxBytes, delimiter] = await Promise.all([setting(deps, who, 'catalogue.csv.maxRows'), setting(deps, who, 'catalogue.csv.maxBytes'), setting(deps, who, 'catalogue.csv.delimiter')]);
  if (!d.csv.trim()) throw new CatalogueError('CSV_INVALID', 'the file is empty', ['csv']);
  if (Buffer.byteLength(d.csv, 'utf8') > maxBytes) throw new CatalogueError('CSV_INVALID', 'the file is too big', [`bytes > ${maxBytes}`]);
  let table;
  try {
    table = readTable(d.csv, delimiter);
  } catch (e) {
    if (e instanceof CsvSyntaxError) throw new CatalogueError('CSV_INVALID', 'a quote is never closed', [`line: ${e.line}`]);
    throw e;
  }
  const header = table.header.map((h) => h.toLowerCase());
  if (!header.includes('product') || !header.includes('rating')) throw new CatalogueError('CSV_INVALID', 'the header needs product and rating columns', ['column: product', 'column: rating']);
  if (table.rows.length > maxRows) throw new CatalogueError('CSV_INVALID', 'too many rows in one file', [`rows: ${table.rows.length} > ${maxRows}`]);
  const col = new Map(header.map((h, i) => [h, i]));
  const known = new Set<string>(REVIEW_IMPORT_COLUMNS);
  const ignoredColumns = table.header.filter((h) => !known.has(h.toLowerCase()));
  const cellOf = (cells: string[]) => (c: Col) => {
    const i = col.get(c);
    return i === undefined ? '' : uncell((cells[i] ?? '').trim());
  };

  // the products the file names, by link or by one of their SKUs, live in this store only
  const names = [...new Set(table.rows.map((r) => cellOf(r.cells)('product')).filter(Boolean))];
  const [bySlug, bySku] = names.length
    ? await Promise.all([
        deps.db.product.findMany({ where: { storeId: who.storeId, slug: { in: names }, archivedAt: null }, select: { id: true, slug: true } }),
        deps.db.productVariant.findMany({ where: { storeId: who.storeId, sku: { in: names }, product: { archivedAt: null } }, select: { sku: true, product: { select: { id: true, slug: true } } } }),
      ])
    : [[], []];
  const product = new Map<string, { id: string; slug: string }>([...bySku.map((v) => [v.sku, v.product] as const), ...bySlug.map((p) => [p.slug, p] as const)]);

  const now = deps.now?.() ?? new Date();
  const seen = new Set<string>();
  const keyOf = (productId: string, name: string, rating: string, words: string) => JSON.stringify([productId, name, rating, words]);
  const planned: { row: ReviewImportRow; data: { productId: string; rating: number; title: string | null; body: string | null; displayName: string | null; sizeLabel: string | null; colourName: string | null; createdAt: Date } }[] = [];
  const rows: ReviewImportRow[] = [];
  const productIds = [...new Set([...product.values()].map((p) => p.id))];
  const existing = productIds.length
    ? await deps.db.review.findMany({ where: { storeId: who.storeId, productId: { in: productIds }, source: 'IMPORT' }, select: { productId: true, displayName: true, rating: true, title: true, body: true } })
    : [];
  for (const e of existing) seen.add(keyOf(e.productId ?? '', e.displayName ?? '', String(e.rating), `${e.title ?? ''}\n${e.body ?? ''}`));

  for (const r of table.rows) {
    const cell = cellOf(r.cells);
    const p = product.get(cell('product')) ?? null;
    const problems = rowProblems(cell, !!p, now);
    if (!problems.length && p) {
      const k = keyOf(p.id, cell('name'), cell('rating'), `${cell('title')}\n${cell('body')}`);
      if (seen.has(k)) problems.push('DUPLICATE');
      else seen.add(k);
    }
    const row: ReviewImportRow = { line: r.line, ok: problems.length === 0, problems, product: p?.slug ?? (cell('product') || null), rating: /^[1-5]$/.test(cell('rating')) ? Number(cell('rating')) : null };
    rows.push(row);
    if (row.ok && p) {
      const written = cell('written');
      planned.push({
        row,
        data: {
          productId: p.id,
          rating: Number(cell('rating')),
          title: cell('title') || null,
          body: cell('body') || null,
          displayName: cell('name') || null,
          sizeLabel: cell('size') || null,
          colourName: cell('colour') || null,
          createdAt: written ? dayOf(written)! : now,
        },
      });
    }
  }

  let created = 0;
  if (!d.dryRun && planned.length) {
    created = await deps.db.$transaction(
      async (tx) => {
        for (const x of planned) {
          const made = await tx.review.create({ data: { storeId: who.storeId, ...x.data, status: 'PENDING', source: 'IMPORT', isVerifiedPurchase: false }, select: { id: true } });
          await logChange(tx, who, 'reviews.import', 'Review', made.id, null, { line: x.row.line, rating: x.data.rating, status: 'PENDING', source: 'IMPORT' });
        }
        return planned.length;
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }
  return { dryRun: d.dryRun, rows, ready: planned.length, created, ignoredColumns };
}
