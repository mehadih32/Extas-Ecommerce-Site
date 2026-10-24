// PR 572–574 — what the shop reads of one auto colour-pair rule (no permission: only what is on sale). `rulePage` is a
// rule's category page (`/combos/<rule key>`, templates L1–L5) in one read: the rule (its names, pieces, state and
// templates), every pair it makes now that has its combo row running — each with its link, pieces in slot order,
// sizes with live stock, and its set price from the one price rule (CN-009: a struck price only behind the owner's
// switch) — the bound products with their colours, sizes and variants, the rule's price table (every mix of the
// pieces' own prices, priced once) and the 2 ↔ 3 piece companion rule ("add 1 more", PR 571 `addOneMore`). The pair
// pages (P1–P5) and the bag's "Add 1 more" (B3) read the same thing, so every page names the same pairs at the same
// prices. A rule switched off, ended or not started yet keeps its page: no pairs, and its state says why.
import { comboWasFor } from '@extas/catalogue';
import { checkStoreId, nowOf, setting, type CombosDeps, type Db } from './context';
import { roundingOf } from './combos-service';
import { generateFor, genCtx, ruleSelect, type RuleRow } from './auto-rules';
import { comboState, daysFromWindow, packRule, setPricing, type ComboState, type PriceRule, type RoundingRule } from './model';
import { choose, type GeneratedPair } from './generate';
import { colourPrice, type ProductFact } from './facts';
import { priceCell } from './page';
import type { PriceCell } from './page-model';
import { ruleKeyOf, type ListPair, type ListPiece, type ListSize, type ListVariant } from './rule-page-model';
import { setPrice } from './summary-model';
import { wasAllowed } from './summary';

/** The most price mixes a rule's table carries (beyond it the page shows each pair's first price). */
export const RULE_PRICE_CAP = 512; // hardcode-ok: page-size cap of a technical lookup table, not a shop limit

export interface RuleInfo {
  id: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  titleEn: string | null;
  titleBn: string | null;
  pieces: number;
  pairing: 'STYLE' | 'ACROSS' | 'ANY';
  sortMode: 'BESTSELLERS' | 'COLOUR';
  season: string | null;
  listTemplateKey: string | null;
  pageTemplateKey: string | null;
  bagTemplateKey: string | null;
  noSinglePiece: boolean;
  addOneMore: boolean;
  state: ComboState;
  startsOn: string | null;
  endsOn: string | null;
}

export interface RuleProduct {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  styleKey: string;
  published: boolean;
  /** The colours the rule uses, in the owner's colour order. */
  colours: { id: string; key: string; nameEn: string; nameBn: string | null; hex: string }[];
  sizes: { id: string; key: string; label: string }[];
  variants: ListVariant[];
}

export interface RulePage {
  rule: RuleInfo;
  /** On sale now: live, priced, every bound product published. */
  onSale: boolean;
  /** The pairs with a running combo row, sold-out ones included (lists leave them out; their pages still open). */
  pairs: ListPair[];
  products: RuleProduct[];
  /** The set price of each mix of piece prices (`ruleKeyOf`), or null when there are too many. */
  prices: Record<string, PriceCell> | null;
  /** The 2-piece ↔ 3-piece rule of the same products ("Make it 3 pcs"), when both are on sale. */
  companion: Omit<RulePage, 'companion'> | null;
}

const infoOf = (r: RuleRow, now: Date, timeZone: string): RuleInfo => ({
  id: r.id,
  key: r.key,
  nameEn: r.name,
  nameBn: r.nameBn,
  titleEn: r.titleEn,
  titleBn: r.titleBn,
  pieces: r.pieces,
  pairing: r.pairing,
  sortMode: r.sortMode,
  season: r.season,
  listTemplateKey: r.listTemplateKey,
  pageTemplateKey: r.pageTemplateKey,
  bagTemplateKey: r.bagTemplateKey,
  noSinglePiece: r.noSinglePiece,
  addOneMore: r.addOneMore,
  state: comboState(r, now),
  ...daysFromWindow(r, timeZone),
});

/** Which pieces are short in each size (two of the same piece need two), with the generator's own open sizes. */
function sizesOf(p: GeneratedPair, facts: ReadonlyMap<string, ProductFact>): ListSize[] {
  return p.sizes.map((s) => {
    const out: number[] = [];
    p.pieces.forEach((x, i) => {
      const f = facts.get(x.productId);
      const sizeId = f?.sizes.find((z) => z.key === s.key)?.id;
      const v = f?.variants.find((y) => y.colourId === x.colourId && y.sizeId === sizeId);
      const need = p.pieces.filter((y) => y.productId === x.productId && y.colourId === x.colourId).length;
      if (!v || v.priceMinor === null || v.sellable < need) out.push(i);
    });
    return { key: s.key, label: s.label, ok: s.ok, sets: s.sets, out };
  });
}

/** Every mix of the bound products' own prices for a pack of `pieces`, priced once with the rule (null past the cap). */
export function rulePriceTable(products: readonly Pick<ProductFact, 'variants'>[], pieces: number, priceRule: PriceRule, rounding: RoundingRule, allowed: boolean | null): Record<string, PriceCell> | null {
  const prices = [...new Set(products.flatMap((p) => p.variants.flatMap((v) => (v.priceMinor === null ? [] : [v.priceMinor]))))].sort((a, b) => a - b);
  const mixes = choose(prices, pieces, true);
  if (mixes.length > RULE_PRICE_CAP) return null;
  const out: Record<string, PriceCell> = {};
  for (const mix of mixes) {
    const list = mix.map((priceMinor) => ({ priceMinor, quantity: 1 }));
    const pricing = setPricing(priceRule, list, rounding);
    out[ruleKeyOf(mix)] = priceCell(setPrice(pricing, list.length, { allowed, live: true, separateMinor: comboWasFor(pricing.payMinor, list).sumMinor ?? pricing.regularMinor }));
  }
  return out;
}

async function readRule(deps: CombosDeps, storeId: number, r: RuleRow, db: Db): Promise<Omit<RulePage, 'companion'>> {
  const [ctx, timeZone, allowed, rounding] = await Promise.all([genCtx(deps, storeId), setting(deps, storeId, 'store.timeZone'), wasAllowed(deps, storeId), roundingOf(deps, storeId)]);
  const rule = infoOf(r, nowOf(deps), timeZone);
  const { gen, facts } = await generateFor(deps, storeId, r, ctx, db);
  const used = [...facts.values()].filter((f) => f.inCombos && f.colours.some((c) => !r.excludeColourIds.includes(c.id)));
  const products: RuleProduct[] = used.map((f) => ({
    id: f.id,
    slug: f.slug,
    nameEn: f.nameEn,
    nameBn: f.nameBn,
    styleKey: f.styleKey,
    published: f.published,
    colours: f.colours.filter((c) => !r.excludeColourIds.includes(c.id)).map((c) => ({ id: c.id, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn, hex: c.hex })),
    sizes: f.sizes.map((s) => ({ id: s.id, key: s.key, label: s.label })),
    variants: f.variants.map((v) => ({ id: v.id, colourId: v.colourId, sizeId: v.sizeId, sellable: v.sellable, priceMinor: v.priceMinor })),
  }));
  const priced = rule.state === 'live';
  const onSale = priced && used.length > 0 && used.every((f) => f.published);
  if (!priced) return { rule, onSale: false, pairs: [], products, prices: null };
  const rows = await db.combo.findMany({
    where: { storeId, autoRuleId: r.id, archivedAt: null, status: 'RUNNING' },
    select: { id: true, slug: true, pieceKey: true, items: { where: { archivedAt: null }, select: { productId: true, allowedColourIds: true, quantity: true }, orderBy: { position: 'asc' } } },
  });
  const byKey = new Map(rows.map((x) => [x.pieceKey, x]));
  const priceRule = packRule(r);
  const pairs: ListPair[] = [];
  for (const [rank, p] of gen.all.entries()) {
    const row = byKey.get(p.pieceKey);
    if (!row) continue;
    const slots: ListPiece[] = row.items.flatMap((i) => (i.productId && i.allowedColourIds[0] ? Array.from({ length: i.quantity }, () => ({ productId: i.productId!, colourId: i.allowedColourIds[0]! })) : []));
    if (slots.length !== p.pieces.length) continue;
    const list = p.pieces.map((x) => ({ priceMinor: colourPrice(facts.get(x.productId)!, x.colourId), quantity: 1 }));
    const price = priceCell(setPrice(p.pricing, p.pieces.length, { allowed, live: true, separateMinor: comboWasFor(p.pricing.payMinor, list).sumMinor ?? p.pricing.regularMinor }));
    const first = facts.get(p.pieces[0]!.productId)!;
    const styleKey = p.pieces.every((x) => facts.get(x.productId)?.styleKey === first.styleKey) ? first.styleKey : 'mix';
    pairs.push({
      comboId: row.id,
      slug: row.slug,
      pieceKey: p.pieceKey,
      pieces: p.pieces.map((x) => ({ productId: x.productId, colourId: x.colourId })),
      slots,
      sameProduct: p.sameProduct,
      styleKey,
      sizes: sizesOf(p, facts),
      openSizes: p.openSizes,
      price,
      isNew: p.isNew,
      pinned: p.pinned,
      pairSales: p.pairSales,
      colourSales: p.colourSales,
      colourOrder: p.colourOrder,
      rank,
    });
  }
  return { rule, onSale: onSale && pairs.some((p) => p.price.pay !== null), pairs, products, prices: rulePriceTable(used, r.pieces, priceRule, rounding, allowed) };
}

/** The other rule of a 2 ↔ 3 piece pair of rules (the 2-piece rule's `addOneMore` + `upsellRuleId`). */
async function companionOf(db: Db, storeId: number, r: RuleRow): Promise<RuleRow | null> {
  if (r.pieces === 2) return r.addOneMore && r.upsellRuleId ? db.comboAutoRule.findFirst({ where: { storeId, id: r.upsellRuleId, archivedAt: null }, select: ruleSelect }) : null;
  return db.comboAutoRule.findFirst({ where: { storeId, upsellRuleId: r.id, addOneMore: true, archivedAt: null, pieces: 2 }, select: ruleSelect, orderBy: { createdAt: 'asc' } });
}

/** One rule's page by its key or id (null when the store has no such rule). */
export async function rulePage(deps: CombosDeps, storeId: number, ref: { key?: string; id?: string }, db: Db = deps.db): Promise<RulePage | null> {
  checkStoreId(storeId);
  if (!ref.key && !ref.id) return null;
  const r = await db.comboAutoRule.findFirst({ where: { storeId, archivedAt: null, ...(ref.id ? { id: ref.id } : { key: ref.key }) }, select: ruleSelect });
  if (!r) return null;
  const [me, other] = await Promise.all([readRule(deps, storeId, r, db), companionOf(db, storeId, r)]);
  const companion = other ? await readRule(deps, storeId, other, db) : null;
  return { ...me, companion: companion && companion.onSale && me.onSale ? companion : null };
}
