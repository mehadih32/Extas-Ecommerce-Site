// S28 · PR 686 (admin prototype v5, Products › Shop ranking) — the order products show in on the shop's own pages
// (category pages, collections, "New in"). Google ranking is separate (Website › SEO).
//   - Every live product gets a score 0–100 from five things the owner weighs (setting `shop.ranking`): sales in the last 30
//     days, visitors who buy (sold ÷ product views), margin, stock health (the share of sizes in stock, and how many days the
//     stock lasts) and newness. A sold-out size lowers the stock part by itself, so people do not open what they cannot buy.
//   - The owner's word wins: a product pinned TOP is always first, one pushed DOWN always last.
//   - `updateRankScores` (the nightly run) writes `rankScore` and the preview; it puts the order on the shop (`sortRank`, which
//     every category, collection and "New in" read already) only when `autoApply` is on. "Save this order" does it by hand.
//   Archived, never deleted; one store at a time; no money moves; the shop never shows a score.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import type { ShopRankingSettings } from '@extas/settings';
import { allow, found, logChange, parse, TX, type CatalogueDeps, type Who } from './context';
import { CatalogueError } from './errors';

export const RANK_PARTS = ['sales', 'conv', 'margin', 'stock', 'fresh'] as const;
export type RankPart = (typeof RANK_PARTS)[number];
export type RankPin = 'TOP' | 'DOWN';
const DAY_MS = 86_400_000;

/** What the score reads about one live product (all from the shop's own facts). */
export interface RankInput {
  productId: string;
  sold30: number;
  views30: number;
  /** (price − cost) ÷ price, 0 when the cost or price is not known (never counted as a good margin). */
  margin: number;
  sizesTotal: number;
  sizesInStock: number;
  /** Days the stock lasts at the 30-day speed; null = nothing sold (no way to tell). */
  stockDays: number | null;
  ageDays: number;
  pin: RankPin | null;
}

export interface RankRow {
  productId: string;
  /** 0–100, whole number. */
  score: number;
  parts: Record<RankPart, number>;
  /** 1 = first on the shop. */
  rank: number;
  pin: RankPin | null;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** The five parts of one product, each 0–1 (the biggest of the shop counts as 1 for sales, visitors who buy and margin). */
export function rankParts(i: RankInput, max: { sold: number; conv: number; margin: number }, s: Pick<ShopRankingSettings, 'freshDays' | 'coverDays'>): Record<RankPart, number> {
  const conv = i.views30 > 0 ? i.sold30 / i.views30 : 0;
  const inStock = i.sizesTotal > 0 ? i.sizesInStock / i.sizesTotal : 0;
  // No sales means no way to tell how long stock lasts: it counts as healthy only for the sizes that are there.
  const cover = i.stockDays === null ? (i.sizesInStock > 0 ? 1 : 0) : clamp01(i.stockDays / s.coverDays);
  return {
    sales: max.sold > 0 ? clamp01(i.sold30 / max.sold) : 0,
    conv: max.conv > 0 ? clamp01(conv / max.conv) : 0,
    margin: max.margin > 0 ? clamp01(Math.max(0, i.margin) / max.margin) : 0,
    stock: clamp01(inStock * 0.6 + cover * 0.4),
    fresh: clamp01(1 - i.ageDays / s.freshDays),
  };
}

/** Scores and orders the products: pinned TOP first, pushed DOWN last, the rest by score (then by sales, then id). */
export function scoreProducts(inputs: readonly RankInput[], s: Pick<ShopRankingSettings, 'weights' | 'freshDays' | 'coverDays'>): RankRow[] {
  const max = {
    sold: Math.max(0, ...inputs.map((i) => i.sold30)),
    conv: Math.max(0, ...inputs.map((i) => (i.views30 > 0 ? i.sold30 / i.views30 : 0))),
    margin: Math.max(0, ...inputs.map((i) => i.margin)),
  };
  const total = RANK_PARTS.reduce((n, k) => n + s.weights[k], 0);
  const rows = inputs.map((i) => {
    const parts = rankParts(i, max, s);
    const score = total > 0 ? (RANK_PARTS.reduce((n, k) => n + s.weights[k] * parts[k], 0) / total) * 100 : 0;
    return { i, parts, score: Math.round(score) };
  });
  const group = (p: RankPin | null) => (p === 'TOP' ? 0 : p === 'DOWN' ? 2 : 1);
  rows.sort((a, b) => group(a.i.pin) - group(b.i.pin) || b.score - a.score || b.i.sold30 - a.i.sold30 || (a.i.productId < b.i.productId ? -1 : 1));
  return rows.map((r, n) => ({ productId: r.i.productId, score: r.score, parts: r.parts, rank: n + 1, pin: r.i.pin }));
}

/** The `sortRank` of the product in place `rank` of `count` (higher = earlier on the shop): the first gets `count`, the last 1. */
export const sortRankOf = (rank: number, count: number): number => Math.max(1, count - rank + 1);

// ---- reading the facts --------------------------------------------------------------------------------------------

/** Orders that count as a sale of a piece for the ranking: placed and not cancelled, returned or still a draft. */
const SOLD_STATUS = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED'] as const;

/** The live products of a store with the facts the score reads. */
export async function loadRankInputs(deps: CatalogueDeps, storeId: number): Promise<{ inputs: RankInput[]; names: Map<string, { name: string; categoryId: string | null; sold30: number }> }> {
  const now = (deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const products = await deps.db.product.findMany({
    where: { storeId, status: 'PUBLISHED', archivedAt: null },
    select: {
      id: true,
      nameEn: true,
      categoryId: true,
      rankPin: true,
      publishedAt: true,
      createdAt: true,
      variants: { where: { archivedAt: null, active: true }, select: { id: true, priceMinor: true, avgCostMinor: true, inStock: true } },
    },
  });
  const ids = products.map((p) => p.id);
  const [sold, viewed] = await Promise.all([
    deps.db.orderItem.groupBy({
      by: ['productId'],
      where: { storeId, productId: { in: ids }, status: 'ACTIVE', order: { status: { in: [...SOLD_STATUS] }, placedAt: { gte: since } } },
      _sum: { quantity: true },
    }),
    deps.db.analyticsEvent.groupBy({ by: ['productId'], where: { storeId, name: 'product_view', productId: { in: ids }, occurredAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const soldBy = new Map(sold.map((r) => [r.productId, r._sum.quantity ?? 0]));
  const viewsBy = new Map(viewed.map((r) => [r.productId, r._count._all]));
  const allVariants = products.flatMap((p) => p.variants.map((v) => v.id));
  const sellable = deps.sellable ? await deps.sellable(allVariants) : null;
  const names = new Map<string, { name: string; categoryId: string | null; sold30: number }>();
  const inputs = products.map((p): RankInput => {
    const stockOf = (v: { id: string; inStock: boolean }) => (sellable ? (sellable.get(v.id) ?? 0) : v.inStock ? 1 : 0);
    const pieces = p.variants.reduce((n, v) => n + stockOf(v), 0);
    const priced = p.variants.filter((v) => v.priceMinor && v.priceMinor > 0 && v.avgCostMinor && v.avgCostMinor > 0);
    const margin = priced.length ? priced.reduce((n, v) => n + (v.priceMinor! - v.avgCostMinor!) / v.priceMinor!, 0) / priced.length : 0;
    const sold30 = soldBy.get(p.id) ?? 0;
    const born = p.publishedAt ?? p.createdAt;
    names.set(p.id, { name: p.nameEn, categoryId: p.categoryId, sold30 });
    return {
      productId: p.id,
      sold30,
      views30: viewsBy.get(p.id) ?? 0,
      margin,
      sizesTotal: p.variants.length,
      sizesInStock: p.variants.filter((v) => stockOf(v) > 0).length,
      stockDays: sellable && sold30 > 0 ? Math.floor((pieces / sold30) * 30) : null,
      ageDays: Math.max(0, (now.getTime() - born.getTime()) / DAY_MS),
      pin: p.rankPin === 'TOP' || p.rankPin === 'DOWN' ? p.rankPin : null,
    };
  });
  return { inputs, names };
}

// ---- the screen and the writes -------------------------------------------------------------------------------------

export interface RankingRow extends RankRow {
  name: string;
  sold30: number;
  /** Places moved since the last saved order (positive = went up); null before any order was saved. */
  moved: number | null;
}

export interface RankingView {
  settings: ShopRankingSettings;
  rows: RankingRow[];
  /** When the last order was put on the shop; null = never. */
  savedAt: string | null;
}

const settingsOf = (deps: CatalogueDeps, storeId: number): Promise<ShopRankingSettings> => deps.settings.value('shop.ranking', { storeId }) as Promise<ShopRankingSettings>;

/** The ranking as it would be now (the screen). `weights` tries other weights without saving anything. */
export async function rankingView(deps: CatalogueDeps, who: Who, tryWeights?: ShopRankingSettings['weights']): Promise<RankingView> {
  await allow(deps, who, 'catalogue.read');
  const s = await settingsOf(deps, who.storeId);
  const weights = tryWeights ? parse(weightsSchema, tryWeights, 'weights') : s.weights;
  const { inputs, names } = await loadRankInputs(deps, who.storeId);
  const rows = scoreProducts(inputs, { ...s, weights });
  const saved = await deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: rows.map((r) => r.productId) } }, select: { id: true, rankPosition: true, rankedAt: true } });
  const pos = new Map(saved.map((r) => [r.id, r.rankPosition]));
  const savedAt = saved.reduce<Date | null>((m, r) => (r.rankedAt && (!m || r.rankedAt > m) ? r.rankedAt : m), null);
  return {
    settings: { ...s, weights },
    savedAt: savedAt ? savedAt.toISOString() : null,
    rows: rows.map((r) => {
      const before = pos.get(r.productId) ?? null;
      return { ...r, name: names.get(r.productId)?.name ?? '', sold30: names.get(r.productId)?.sold30 ?? 0, moved: before === null ? null : before - r.rank };
    }),
  };
}

const weightsSchema = z.object({ sales: z.number().int().min(0).max(50), conv: z.number().int().min(0).max(50), margin: z.number().int().min(0).max(50), stock: z.number().int().min(0).max(50), fresh: z.number().int().min(0).max(50) }).strict();

/** Writes the scores and, when `apply`, the order itself (`sortRank` = the place, `rankPosition`, `rankedAt`). */
async function write(deps: CatalogueDeps, storeId: number, rows: readonly RankRow[], apply: boolean, now: Date): Promise<number> {
  let changedRows = 0;
  await deps.db.$transaction(async (tx) => {
    const cur = await tx.product.findMany({ where: { storeId, id: { in: rows.map((r) => r.productId) } }, select: { id: true, rankScore: true, sortRank: true, rankPosition: true } });
    const was = new Map(cur.map((c) => [c.id, c]));
    for (const r of rows) {
      const c = was.get(r.productId);
      if (!c) continue;
      const data: Prisma.ProductUpdateManyMutationInput = {};
      if (c.rankScore !== r.score) data.rankScore = r.score;
      if (apply) {
        const sr = sortRankOf(r.rank, rows.length);
        if (c.sortRank !== sr) data.sortRank = sr;
        if (c.rankPosition !== r.rank) data.rankPosition = r.rank;
        data.rankedAt = now;
      }
      if (Object.keys(data).length) {
        await tx.product.updateMany({ where: { id: r.productId, storeId }, data });
        changedRows += 1;
      }
    }
  }, TX);
  return changedRows;
}

/** "Save this order": puts the order on the shop now. Needs `catalogue.write`. */
export async function saveRankingOrder(deps: CatalogueDeps, who: Who, input?: { weights?: ShopRankingSettings['weights'] }): Promise<{ saved: number; products: number }> {
  await allow(deps, who, 'catalogue.write');
  const s = await settingsOf(deps, who.storeId);
  const weights = input?.weights ? parse(weightsSchema, input.weights, 'weights') : s.weights;
  const { inputs } = await loadRankInputs(deps, who.storeId);
  const rows = scoreProducts(inputs, { ...s, weights });
  const now = (deps.now ?? (() => new Date()))();
  const saved = await write(deps, who.storeId, rows, true, now);
  await logChange(deps.db, who, 'shop.ranking.save', 'Store', String(who.storeId), null, { products: rows.length, changed: saved, weights });
  return { saved, products: rows.length };
}

/** Pin a product to the top, push it to the end, or put it back (`null`). Takes effect with the next saved order. */
export async function setRankPin(deps: CatalogueDeps, who: Who, productId: string, pin: RankPin | null): Promise<{ productId: string; pin: RankPin | null }> {
  await allow(deps, who, 'catalogue.write');
  if (pin !== null && pin !== 'TOP' && pin !== 'DOWN') throw new CatalogueError('INVALID_INPUT', 'pin is TOP, DOWN or null', ['pin']);
  const p = found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, rankPin: true } }), 'product');
  await deps.db.product.update({ where: { id: p.id }, data: { rankPin: pin } });
  await logChange(deps.db, who, 'shop.ranking.pin', 'Product', p.id, { pin: p.rankPin }, { pin });
  return { productId: p.id, pin };
}

/** The nightly run of one store: scores every live product; puts the order on the shop only while `autoApply` is on. */
export async function updateRankScores(deps: CatalogueDeps, storeId: number): Promise<{ products: number; changed: number; applied: boolean }> {
  const s = await settingsOf(deps, storeId);
  const { inputs } = await loadRankInputs(deps, storeId);
  const rows = scoreProducts(inputs, s);
  const now = (deps.now ?? (() => new Date()))();
  const changed = await write(deps, storeId, rows, s.autoApply, now);
  return { products: rows.length, changed, applied: s.autoApply };
}
