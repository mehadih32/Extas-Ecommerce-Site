// PR 128 (S04) — "Complete your look" on the thank-you page (demo 52-thanks.js ty_look): the pieces that go with what
// he just ordered, from the shop's real sets and pairs only — nothing invented. A piece is suggested when a running
// combo (its window open, not archived) has a slot for a product of his order and another slot for that piece. The
// pieces come in the order the shop's own data ranks them: the combos customers picked most (PopularPair counts),
// then the owner's featured combos and his sort order, then the slot order. A piece already in the order, archived
// or not published is never suggested. No combo, no suggestion: the page then shows no block at all.
import type { CombosDeps } from './context';

/** One running combo as the ranking reads it. */
export interface LookCombo {
  id: string;
  isFeatured: boolean;
  sortRank: number;
  /** How often customers picked this combo's colour pairs (PopularPair.pickCount summed). */
  picks: number;
  /** Its slots' products, in slot order (a category slot has none). */
  productIds: (string | null)[];
}

/**
 * The pieces that complete an order's look, best first, at most `max`: the other products of every combo that holds
 * one of the order's products. Pure.
 */
export function rankLook(combos: readonly LookCombo[], ordered: ReadonlySet<string>, max: number): string[] {
  const hits = combos
    .filter((c) => c.productIds.some((p) => p !== null && ordered.has(p)))
    .sort((a, b) => b.picks - a.picks || Number(b.isFeatured) - Number(a.isFeatured) || a.sortRank - b.sortRank || a.id.localeCompare(b.id));
  const out: string[] = [];
  for (const c of hits)
    for (const p of c.productIds) {
      if (out.length >= max) return out;
      if (p && !ordered.has(p) && !out.includes(p)) out.push(p);
    }
  return out;
}

/** The products that complete the look of an order with these products (published, not archived), best first. */
export async function lookFor(deps: Pick<CombosDeps, 'db' | 'now'>, input: { storeId: number; productIds: readonly string[]; max: number }): Promise<string[]> {
  if (!input.productIds.length || input.max < 1) return [];
  const now = deps.now?.() ?? new Date();
  const rows = await deps.db.combo.findMany({
    where: {
      storeId: input.storeId,
      status: 'RUNNING',
      archivedAt: null,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      items: { some: { archivedAt: null, productId: { in: [...input.productIds] } } },
    },
    select: { id: true, isFeatured: true, sortRank: true, items: { where: { archivedAt: null }, orderBy: { position: 'asc' }, select: { productId: true } }, popularPairs: { select: { pickCount: true } } },
    take: 200,
  });
  const ranked = rankLook(
    rows.map((r) => ({ id: r.id, isFeatured: r.isFeatured, sortRank: r.sortRank, picks: r.popularPairs.reduce((s, p) => s + p.pickCount, 0), productIds: r.items.map((i) => i.productId) })),
    new Set(input.productIds),
    input.max * 4,
  );
  if (!ranked.length) return [];
  const live = await deps.db.product.findMany({ where: { storeId: input.storeId, id: { in: ranked }, status: 'PUBLISHED', archivedAt: null }, select: { id: true } });
  const ok = new Set(live.map((p) => p.id));
  return ranked.filter((id) => ok.has(id)).slice(0, input.max);
}
