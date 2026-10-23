// PR 91–95, 102, 103 — what the shop's combo pages read (no permission: only what is on sale). `setPage` is everything
// the combo page (`/combo/<link>`) needs in one read of the combo: the summary (PR 96), the pieces as slots with their
// live stock, the price table (every mix of the pieces' own prices priced once with the one price rule, so the page
// never works out a price itself), the customer's bag use (no oversell), the picks of a set being changed in the bag,
// and the popular pairs (PR 94). `setCards` is the cards of "More sets", the sets landing page and the product page's
// set offer (PR 102, 103): the running combos on sale, each with its first colours and its set price, in one batch.
import { comboWasFor } from '@extas/catalogue';
import { checkStoreId, nowOf, setting, type CombosDeps, type Db } from './context';
import { comboSelect, roundingOf, toComboView } from './combos-service';
import { packRule, setPricing, type PriceRule } from './model';
import { CombosError } from './errors';
import { productFacts } from './facts';
import { bagUse, comboForSale, type ComboForSale } from './set-check';
import { firstColours, firstPrice, summaryOf, wasAllowed, type SetSummary } from './summary';
import { setPrice, type SetPrice } from './summary-model';
import { expandSlots, type SetSlot, type SlotChoice, type VariantStock } from './validate';
import { pairsShown, popularPairs, priceKeyOf, priceMixes, type PriceCell, type SetCard, type SetCardRule } from './page-model';

/** The most price mixes the page carries (beyond it the page asks the server for the price of its picks). */
export const PRICE_TABLE_CAP = 512; // hardcode-ok: page-size cap of a technical lookup table, not a shop limit
/** The most combos one landing page or "More sets" row reads. */
export const SET_CARDS_CAP = 1000;

export const priceCell = (p: SetPrice): PriceCell => ({ pay: p.payMinor, regular: p.regularMinor, saving: p.savingMinor, was: p.wasMinor, offer: p.offer });

export interface PairChip {
  colourIds: string[];
  /** A generated pair's own page (its colours are fixed); null = the colours are picked on this page. */
  slug: string | null;
}

export interface SetPageOptions {
  /** The customer's open bag (its pieces are counted against the stock). */
  cartId?: string;
  /** `?from=<group>`: the set in the bag being changed. */
  editGroupKey?: string;
  /** `combos.page.popularPairs`. */
  pairs: { on: boolean; max: number; learn: boolean; minPicks: number };
}

export interface SetPage {
  summary: SetSummary;
  autoApply: boolean;
  isFeatured: boolean;
  ruleId: string | null;
  slots: SetSlot[];
  /** The live variants of the set's products (sellable now, own price). */
  variants: VariantStock[];
  /** The set price of every mix of piece prices (`priceKeyOf`); null when there are too many (ask the server). */
  prices: Record<string, PriceCell> | null;
  /** Pieces of each variant the bag already holds (not counting the set being changed). */
  inBag: Record<string, number>;
  /** The set being changed in the bag: its picks, slot by slot. */
  edit: { groupKey: string; choices: SlotChoice[] } | null;
  pairs: PairChip[];
}

/** The price table: each mix of the pieces' own prices, priced with the combo's rule. */
export function priceTable(c: Pick<ComboForSale, 'slots' | 'variants' | 'priceRule' | 'rounding' | 'onSale'>, allowed: boolean | null, cap = PRICE_TABLE_CAP): Record<string, PriceCell> | null {
  const mixes = priceMixes(c.slots, c.variants, cap);
  if (!mixes) return null;
  const out: Record<string, PriceCell> = {};
  for (const mix of mixes) {
    const pieces = mix.map((priceMinor) => ({ priceMinor, quantity: 1 }));
    const pricing = setPricing(c.priceRule, pieces, c.rounding);
    out[priceKeyOf(mix)] = priceCell(setPrice(pricing, pieces.length, { allowed, live: c.onSale, separateMinor: comboWasFor(pricing.payMinor, pieces).sumMinor ?? pricing.regularMinor }));
  }
  return out;
}

/** The picks of a set in the bag, slot by slot (its lines matched to the slots by product, in the order they went in). */
async function editPicks(db: Db, storeId: number, cartId: string | undefined, groupKey: string | undefined, c: ComboForSale): Promise<SetPage['edit']> {
  if (!cartId || !groupKey) return null;
  const lines = await db.cartItem.findMany({ where: { storeId, cartId, comboGroupKey: groupKey, removedAt: null }, select: { variantId: true, comboId: true }, orderBy: { createdAt: 'asc' } });
  if (!lines.length || lines.some((l) => l.comboId !== c.view.id)) return null;
  const byId = new Map(c.variants.map((v) => [v.id, v]));
  const left = lines.map((l) => byId.get(l.variantId)).filter((v): v is VariantStock => Boolean(v));
  const choices = c.slots.map((s) => {
    const k = left.findIndex((v) => v.productId === s.productId);
    if (k < 0) return {};
    const v = left.splice(k, 1)[0]!;
    return { colourId: v.colourId, sizeId: v.sizeId };
  });
  return { groupKey, choices };
}

/** PR 94 — a generated pair's colours are fixed: its sibling pairs (same rule, same products) are the other colours. */
async function siblingPairs(db: Db, storeId: number, c: ComboForSale, max: number): Promise<PairChip[]> {
  if (!c.rule) return [];
  const rows = await db.combo.findMany({
    where: { storeId, autoRuleId: c.rule.id, archivedAt: null, status: 'RUNNING' },
    select: { id: true, slug: true, sortRank: true, items: { where: { archivedAt: null }, select: { position: true, productId: true, allowedColourIds: true, quantity: true }, orderBy: { position: 'asc' } } },
    orderBy: { sortRank: 'asc' },
    take: SET_CARDS_CAP,
  });
  const me = c.slots.map((s) => s.productId).join();
  const picks = await db.popularPair.groupBy({ by: ['comboId'], where: { storeId, comboId: { in: rows.map((r) => r.id) } }, _sum: { pickCount: true } });
  const count = new Map(picks.map((p) => [p.comboId, p._sum.pickCount ?? 0]));
  const chips = rows
    .map((r) => {
      const slots = r.items.flatMap((i) => Array.from({ length: i.quantity }, () => ({ productId: i.productId, colourId: i.allowedColourIds[0] ?? null })));
      return { r, slots };
    })
    .filter((x) => x.slots.map((s) => s.productId).join() === me && x.slots.every((s) => s.colourId))
    .sort((a, b) => (a.r.id === c.view.id ? -1 : b.r.id === c.view.id ? 1 : (count.get(b.r.id) ?? 0) - (count.get(a.r.id) ?? 0) || a.r.sortRank - b.r.sortRank))
    .map((x) => ({ colourIds: x.slots.map((s) => s.colourId!), slug: x.r.id === c.view.id ? null : x.r.slug }));
  return chips.slice(0, pairsShown(chips.length, max));
}

/** Everything the combo page needs, in one read of the combo (any state: an ended combo's page still opens). */
export async function setPage(deps: CombosDeps, ref: { storeId: number; slug: string }, o: SetPageOptions, db: Db = deps.db): Promise<SetPage> {
  checkStoreId(ref.storeId);
  const c = await comboForSale(deps, ref.storeId, { slug: ref.slug }, db);
  const [summary, allowed, inBag, edit] = await Promise.all([
    summaryOf(deps, ref.storeId, c),
    wasAllowed(deps, ref.storeId),
    bagUse(db, ref.storeId, o.cartId, o.editGroupKey),
    editPicks(db, ref.storeId, o.cartId, o.editGroupKey, c),
  ]);
  let pairs: PairChip[] = [];
  if (o.pairs.on && c.onSale) {
    if (c.rule) pairs = await siblingPairs(db, ref.storeId, c, o.pairs.max);
    else {
      const learned = o.pairs.learn
        ? await db.popularPair.findMany({ where: { storeId: ref.storeId, comboId: c.view.id, pickCount: { gte: o.pairs.minPicks } }, select: { colourIds: true }, orderBy: [{ pickCount: 'desc' }, { updatedAt: 'desc' }], take: 12 })
        : [];
      const fact = c.facts.get(c.slots[0]?.productId ?? '');
      pairs = popularPairs({
        slots: c.slots,
        variants: c.variants,
        colourOrder: fact?.colours.map((x) => x.id) ?? [],
        learned: learned.map((l) => l.colourIds),
        needsMix: summary.needsMix,
        max: o.pairs.max,
      }).map((colourIds) => ({ colourIds, slug: null }));
    }
  }
  return {
    summary,
    autoApply: c.view.autoApply,
    isFeatured: c.view.isFeatured,
    ruleId: c.rule?.id ?? null,
    slots: c.slots,
    variants: c.variants,
    prices: priceTable(c, allowed),
    inBag,
    edit,
    pairs,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// PR 102, 103 · the set cards
// ---------------------------------------------------------------------------------------------------------------

export interface SetCardsQuery {
  /** Only sets with this product in them (the product page's offer). */
  productId?: string;
  /** Leave this combo out ("More sets" on its own page). */
  exceptId?: string;
}

/** The running combos on sale now, every piece in stock, with their first colours and set price, in one batch. */
export async function setCards(deps: CombosDeps, storeId: number, q: SetCardsQuery = {}, db: Db = deps.db): Promise<{ cards: SetCard[]; rules: SetCardRule[] }> {
  checkStoreId(storeId);
  if (q.productId !== undefined && !/^[0-9a-f-]{36}$/i.test(q.productId)) throw new CombosError('INVALID_INPUT', 'not a product id', ['productId']);
  const rows = await db.combo.findMany({
    where: { storeId, archivedAt: null, status: 'RUNNING', ...(q.exceptId ? { id: { not: q.exceptId } } : {}), ...(q.productId ? { items: { some: { productId: q.productId, archivedAt: null } } } : {}) },
    select: comboSelect,
    orderBy: [{ sortRank: 'asc' }, { createdAt: 'desc' }],
    take: SET_CARDS_CAP,
  });
  if (!rows.length) return { cards: [], rules: [] };
  const ruleIds = [...new Set(rows.flatMap((r) => (r.autoRuleId ? [r.autoRuleId] : [])))];
  const ids = [...new Set(rows.flatMap((r) => r.items.flatMap((i) => (i.productId ? [i.productId] : []))))];
  const [facts, rounding, timeZone, allowed, ruleRows] = await Promise.all([
    productFacts({ db, settings: deps.settings }, storeId, ids),
    roundingOf(deps, storeId),
    setting(deps, storeId, 'store.timeZone'),
    wasAllowed(deps, storeId),
    ruleIds.length
      ? db.comboAutoRule.findMany({
          where: { storeId, id: { in: ruleIds }, archivedAt: null },
          select: { id: true, key: true, name: true, nameBn: true, titleEn: true, titleBn: true, season: true, pairing: true, pieces: true, priceMode: true, priceMinor: true, percentOff: true },
        })
      : Promise.resolve([]),
  ]);
  const rules = new Map(ruleRows.map((r) => [r.id, r]));
  const now = nowOf(deps);
  const variants = [...facts.values()].flatMap((p) => p.variants.map((v) => ({ id: v.id, productId: p.id, colourId: v.colourId, sizeId: v.sizeId, sellable: v.sellable, priceMinor: v.priceMinor })));
  const cards: SetCard[] = [];
  for (const row of rows) {
    const rule = row.autoRuleId ? rules.get(row.autoRuleId) : undefined;
    if (row.autoRuleId && !rule) continue;
    const priceRule: PriceRule = rule ? packRule(rule) : { mode: 'FIXED', setMinor: row.setPriceMinor };
    const view = toComboView(row, facts, { now, timeZone, rounding, priceRule });
    const slots = expandSlots(view.items);
    const published = slots.length > 1 && slots.every((s) => facts.get(s.productId)?.published);
    if (view.state !== 'live' || view.blocking.length || view.pricing.payMinor === null || !published) continue;
    const c = { slots, facts, variants, priceRule, rounding, onSale: true };
    const first = firstColours(c, view.oneProduct && !view.sameColour);
    const inStock = slots.every((s, i) => variants.some((v) => (s.fixedVariantId ? v.id === s.fixedVariantId : v.productId === s.productId && v.colourId === first[i]) && v.sellable > 0));
    if (!inStock) continue;
    const colourIds = [...new Set(slots.flatMap((s) => (s.colourIds.length ? s.colourIds : (facts.get(s.productId)?.colours.map((x) => x.id) ?? []))))];
    cards.push({
      comboId: view.id,
      slug: view.slug,
      nameEn: view.nameEn,
      nameBn: view.nameBn,
      descriptionEn: view.descriptionEn,
      descriptionBn: view.descriptionBn,
      type: view.type,
      ruleId: row.autoRuleId,
      sortRank: row.sortRank,
      isFeatured: view.isFeatured,
      pieces: slots.map((s, i) => ({ productId: s.productId, colourId: first[i] ?? null })),
      productIds: slots.map((s) => s.productId),
      colourIds,
      price: priceCell(firstPrice(c, first, allowed)),
    });
  }
  const used = new Set(cards.flatMap((c) => (c.ruleId ? [c.ruleId] : [])));
  return {
    cards,
    rules: ruleRows.filter((r) => used.has(r.id)).map((r) => ({ id: r.id, key: r.key, nameEn: r.name, nameBn: r.nameBn, titleEn: r.titleEn, titleBn: r.titleBn, season: r.season, pairing: r.pairing, pieces: r.pieces })),
  };
}
