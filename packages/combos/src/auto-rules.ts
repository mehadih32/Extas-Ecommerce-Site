// PR 571 — auto colour-pair rules (the owner's model; demo #/admin/combos tabs "Auto colour-pair combos", "+ Make a
// combo", "Archive"). A rule binds categories and products, says 2 or 3 pieces and how they pair, and prices a pack
// (a fixed amount, or a share off the regular total). Every pair it makes is kept as its own combo row (one per
// `pieceKey` for ever), so each pair has a link that never dies and its orders and views count on one row:
//   - a pair a rule no longer makes (a colour left out, a product taken out) is ENDED, never deleted, and comes back
//     on the same link when it is made again;
//   - a sold-out pair stays (hidden from lists while no size is open; its page still opens).
// The pairs are made again after every change to the rule (and by `syncStoreAutoRules`, for the job that follows
// product, colour, price and stock changes). Permissions: `combos.write` to make and change; `combos.prices` for a
// price (the owner's decision, CLAUDE.md rule 6) — a "% off" share is a price too; `combos.publish` to switch on or
// off and for the dates. Nothing is deleted: a rule switched off (or past its end) moves to the Archive.
import type { Prisma } from '@extas/db/client';
import { actorId, allow, allowPrice, found, logChange, nowOf, parse, setting, TX, type CombosDeps, type Db, type Who } from './context';
import { roundingOf } from './combos-service';
import { CombosError } from './errors';
import { boundProductIds, productFacts, type ProductFact } from './facts';
import { generatePairs, NO_SALES, type GeneratedPair, type GenResult, type GenRule, type SalesSignals } from './generate';
import {
  autoRuleInputSchema,
  autoRuleShape,
  comboState,
  daysFromWindow,
  packPriced,
  packRule,
  rulePath,
  windowFromDays,
  type AutoRuleData,
  type AutoRuleInput,
  type ComboState,
  type PackPrice,
  type RoundingRule,
  type SetPricing,
} from './model';

export const ruleSelect = {
  id: true,
  key: true,
  name: true,
  nameBn: true,
  titleEn: true,
  titleBn: true,
  sourceIds: true,
  productIds: true,
  pieces: true,
  pairing: true,
  sameColour: true,
  excludeColourIds: true,
  priceMode: true,
  priceMinor: true,
  percentOff: true,
  sortMode: true,
  pinnedKeys: true,
  season: true,
  listTemplateKey: true,
  pageTemplateKey: true,
  bagTemplateKey: true,
  noSinglePiece: true,
  addOneMore: true,
  upsellRuleId: true,
  status: true,
  startsAt: true,
  endsAt: true,
  lastGeneratedAt: true,
  version: true,
  updatedAt: true,
} satisfies Prisma.ComboAutoRuleSelect;
export type RuleRow = Prisma.ComboAutoRuleGetPayload<{ select: typeof ruleSelect }>;

export interface PairPieceView {
  productId: string;
  colourId: string;
  productSlug: string;
  productNameEn: string;
  productNameBn: string | null;
  colourKey: string;
  colourNameEn: string;
  colourNameBn: string | null;
  hex: string;
}

export interface PairView {
  /** The pair's combo row (null in a preview of a rule not saved yet). */
  comboId: string | null;
  slug: string;
  pairSlug: string;
  pieceKey: string;
  pieces: PairPieceView[];
  pricing: SetPricing;
  openSizes: number;
  sizes: GeneratedPair['sizes'];
  isNew: boolean;
  pinned: boolean;
  sameProduct: boolean;
}

export interface RuleCounts {
  /** Pairs the rule makes. */
  made: number;
  /** Of them, with an open size. */
  withStock: number;
  /** Products it took in. */
  products: number;
  /** More would be made than the limit allows (`combos.generate.maxPairsPerRule`). */
  truncated: boolean;
}

export interface AutoRuleView {
  id: string;
  key: string;
  /** The rule's page on the shop. */
  path: string;
  nameEn: string;
  nameBn: string | null;
  titleEn: string | null;
  titleBn: string | null;
  categoryIds: string[];
  productIds: string[];
  /** What it is bound to, as names (categories, then products). */
  bound: { kind: 'category' | 'product'; id: string; nameEn: string; nameBn: string | null }[];
  pieces: number;
  pairing: 'STYLE' | 'ACROSS' | 'ANY';
  sameColour: boolean;
  excludeColourIds: string[];
  priceMode: 'FIXED' | 'PERCENT';
  priceMinor: number | null;
  percentOff: number | null;
  sortMode: 'BESTSELLERS' | 'COLOUR';
  pinnedKeys: string[];
  season: string | null;
  listTemplateKey: string | null;
  pageTemplateKey: string | null;
  bagTemplateKey: string | null;
  noSinglePiece: boolean;
  addOneMore: boolean;
  upsell: { id: string; key: string; nameEn: string; nameBn: string | null; state: ComboState; priced: boolean } | null;
  /** The 2-piece rule this 3-piece rule is the "add 1 more" of. */
  upsellOf: { id: string; key: string; nameEn: string } | null;
  status: string;
  state: ComboState;
  startsOn: string | null;
  endsOn: string | null;
  counts: RuleCounts;
  /** The first pair in the rule's order (its card photo and price line). */
  top: PairView | null;
  /** Why it cannot go on sale (empty = it can): NO_PAIRS, NO_SET_PRICE. */
  blocking: string[];
  lastGeneratedAt: string | null;
  version: number;
}

const genRule = (r: Pick<RuleRow, 'key' | 'pieces' | 'pairing' | 'sameColour' | 'excludeColourIds' | 'priceMode' | 'priceMinor' | 'percentOff' | 'sortMode' | 'pinnedKeys'>): GenRule => ({
  key: r.key,
  pieces: r.pieces,
  pairing: r.pairing,
  sameColour: r.sameColour,
  excludeColourIds: r.excludeColourIds,
  price: packRule(r),
  sortMode: r.sortMode,
  pinnedKeys: r.pinnedKeys,
});

export const pairComboSlug = (ruleKey: string, pairSlug: string) => `${ruleKey}~${pairSlug}`;

function pairView(p: GeneratedPair, ruleKey: string, facts: ReadonlyMap<string, ProductFact>, comboId: string | null): PairView {
  return {
    comboId,
    slug: pairComboSlug(ruleKey, p.pairSlug),
    pairSlug: p.pairSlug,
    pieceKey: p.pieceKey,
    pieces: p.pieces.map((x) => {
      const f = facts.get(x.productId)!;
      const c = f.colours.find((k) => k.id === x.colourId)!;
      return { productId: f.id, colourId: c.id, productSlug: f.slug, productNameEn: f.nameEn, productNameBn: f.nameBn, colourKey: c.key, colourNameEn: c.nameEn, colourNameBn: c.nameBn, hex: c.hex };
    }),
    pricing: p.pricing,
    openSizes: p.openSizes,
    sizes: p.sizes,
    isNew: p.isNew,
    pinned: p.pinned,
    sameProduct: p.sameProduct,
  };
}

interface GenCtx {
  rounding: RoundingRule;
  now: Date;
  newColourDays: number;
  cap: number;
  salesDays: number;
}

async function genCtx(deps: CombosDeps, storeId: number): Promise<GenCtx> {
  const [rounding, newColourDays, cap, salesDays] = await Promise.all([
    roundingOf(deps, storeId),
    setting(deps, storeId, 'combos.newColourDays'),
    setting(deps, storeId, 'combos.generate.maxPairsPerRule'),
    setting(deps, storeId, 'combos.generate.salesDays'),
  ]);
  return { rounding, now: nowOf(deps), newColourDays, cap, salesDays };
}

/** Past sales the best-seller order counts: each colour's single sales, and each pair's own sales (its combo row). */
async function salesSignals(db: Db, storeId: number, facts: ReadonlyMap<string, ProductFact>, pairRows: readonly { id: string; pieceKey: string | null; pieceCount: number }[], since: Date): Promise<SalesSignals> {
  const productIds = [...facts.keys()];
  if (!productIds.length) return NO_SALES;
  const counted = { storeId, status: 'ACTIVE' as const, createdAt: { gte: since }, order: { status: { notIn: ['DRAFT', 'CANCELLED', 'RETURNED'] as ('DRAFT' | 'CANCELLED' | 'RETURNED')[] } } };
  const [byVariant, byCombo] = await Promise.all([
    db.orderItem.groupBy({ by: ['productId', 'variantId'], where: { ...counted, productId: { in: productIds } }, _sum: { quantity: true } }),
    pairRows.length ? db.orderItem.groupBy({ by: ['comboId'], where: { ...counted, comboId: { in: pairRows.map((r) => r.id) } }, _sum: { quantity: true } }) : Promise.resolve([]),
  ]);
  const colour = new Map<string, number>();
  for (const g of byVariant) {
    const f = g.productId ? facts.get(g.productId) : undefined;
    const v = f?.variants.find((x) => x.id === g.variantId);
    if (!f || !v?.colourId) continue;
    const k = `${f.id}|${v.colourId}`;
    colour.set(k, (colour.get(k) ?? 0) + (g._sum.quantity ?? 0));
  }
  const rowById = new Map(pairRows.map((r) => [r.id, r]));
  const pair = new Map<string, number>();
  for (const g of byCombo) {
    const r = g.comboId ? rowById.get(g.comboId) : undefined;
    if (r?.pieceKey) pair.set(r.pieceKey, (g._sum.quantity ?? 0) / Math.max(1, r.pieceCount));
  }
  return { colour, pair };
}

/** The pairs of a rule now: bound products, their facts, past sales, generated. */
async function generateFor(deps: CombosDeps, storeId: number, r: Pick<RuleRow, 'key' | 'sourceIds' | 'productIds' | 'pieces' | 'pairing' | 'sameColour' | 'excludeColourIds' | 'priceMode' | 'priceMinor' | 'percentOff' | 'sortMode' | 'pinnedKeys'> & { id?: string }, ctx: GenCtx, db: Db = deps.db): Promise<{ gen: GenResult; facts: Map<string, ProductFact>; rows: { id: string; pieceKey: string | null; pieceCount: number }[] }> {
  const ids = await boundProductIds(db, storeId, { categoryIds: r.sourceIds, productIds: r.productIds });
  const facts = await productFacts({ db, settings: deps.settings }, storeId, ids);
  const ordered = ids.flatMap((id) => (facts.has(id) ? [facts.get(id)!] : []));
  const rows = r.id ? await db.combo.findMany({ where: { autoRuleId: r.id }, select: { id: true, pieceKey: true, pieceCount: true } }) : [];
  const since = new Date(ctx.now.getTime() - ctx.salesDays * 86_400_000);
  const signals = await salesSignals(db, storeId, facts, rows, since);
  return { gen: generatePairs(genRule(r), ordered, signals, ctx), facts, rows };
}

const ruleTitle = (r: Pick<RuleRow, 'titleEn' | 'titleBn' | 'name' | 'nameBn'>) => ({ en: r.titleEn ?? r.name, bn: r.titleBn ?? r.titleEn ?? r.nameBn ?? r.name });

/** The pair's combo row as the rule makes it now (its name, kind, window, templates and status follow the rule). */
function pairData(r: RuleRow, p: GeneratedPair, facts: ReadonlyMap<string, ProductFact>, rank: number) {
  const pieces = p.pieces.map((x) => {
    const f = facts.get(x.productId)!;
    return { f, c: f.colours.find((k) => k.id === x.colourId)! };
  });
  const title = p.sameProduct ? { en: pieces[0]!.f.nameEn, bn: pieces[0]!.f.nameBn ?? pieces[0]!.f.nameEn } : ruleTitle(r);
  return {
    nameEn: `${title.en} — ${pieces.map((x) => x.c.nameEn).join(' + ')}`,
    nameBn: `${title.bn} — ${pieces.map((x) => x.c.nameBn ?? x.c.nameEn).join(' + ')}`,
    type: (p.sameProduct || r.pairing === 'STYLE' ? 'COLOUR_PAIR' : 'MIXED_SET') as 'COLOUR_PAIR' | 'MIXED_SET',
    pieceCount: p.pieces.length,
    setPriceMinor: r.priceMode === 'FIXED' ? r.priceMinor : null,
    status: r.status,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    sortRank: rank,
    colourOrderKey: p.pairSlug,
    listTemplateKey: r.listTemplateKey,
    pageTemplateKey: r.pageTemplateKey,
    bagTemplateKey: r.bagTemplateKey,
    sameColour: r.sameColour,
  };
}

/** The slots of a pair: one per (product, colour), with how many of it. */
function pairItems(storeId: number, comboId: string, p: GeneratedPair) {
  const slots: { productId: string; colourId: string; quantity: number }[] = [];
  for (const x of p.pieces) {
    const s = slots.find((y) => y.productId === x.productId && y.colourId === x.colourId);
    if (s) s.quantity++;
    else slots.push({ ...x, quantity: 1 });
  }
  return slots.map((s, n) => ({ storeId, comboId, position: n + 1, productId: s.productId, allowedColourIds: [s.colourId], allowedSizeIds: [], quantity: s.quantity }));
}

export interface SyncReport {
  ruleId: string;
  made: number;
  created: number;
  updated: number;
  ended: number;
}

/**
 * Makes the rule's pairs again and writes them: a new pair gets its row, a pair made before follows the rule (name,
 * status, window, rank, templates), a pair no longer made is ENDED (never deleted). One transaction.
 */
export async function syncRule(deps: CombosDeps, storeId: number, ruleId: string, who?: Who): Promise<SyncReport> {
  const ctx = await genCtx(deps, storeId);
  const r = found(await deps.db.comboAutoRule.findFirst({ where: { id: ruleId, storeId }, select: ruleSelect }), 'combo rule');
  const { gen, facts } = await generateFor(deps, storeId, r, ctx);
  return deps.db.$transaction(async (tx) => {
    const existing = await tx.combo.findMany({
      where: { autoRuleId: r.id },
      select: { id: true, pieceKey: true, nameEn: true, nameBn: true, type: true, status: true, startsAt: true, endsAt: true, sortRank: true, setPriceMinor: true, listTemplateKey: true, pageTemplateKey: true, bagTemplateKey: true, sameColour: true, endedAt: true },
    });
    const byKey = new Map(existing.map((e) => [e.pieceKey, e]));
    const made = new Set<string>();
    let created = 0;
    let updated = 0;
    let ended = 0;
    for (const [rank, p] of gen.all.entries()) {
      made.add(p.pieceKey);
      const data = pairData(r, p, facts, rank);
      const e = byKey.get(p.pieceKey);
      const endedAt = r.status === 'RUNNING' || r.status === 'DRAFT' ? null : (e?.endedAt ?? ctx.now);
      if (!e) {
        const c = await tx.combo.create({
          data: { storeId, autoRuleId: r.id, pieceKey: p.pieceKey, slug: pairComboSlug(r.key, p.pairSlug), ...data, endedAt, createdById: who ? actorId(who) : null },
          select: { id: true },
        });
        await tx.comboItem.createMany({ data: pairItems(storeId, c.id, p) });
        created++;
        continue;
      }
      const same =
        e.nameEn === data.nameEn &&
        e.nameBn === data.nameBn &&
        e.type === data.type &&
        e.status === data.status &&
        e.startsAt?.getTime() === data.startsAt?.getTime() &&
        e.endsAt?.getTime() === data.endsAt?.getTime() &&
        e.sortRank === data.sortRank &&
        e.setPriceMinor === data.setPriceMinor &&
        e.listTemplateKey === data.listTemplateKey &&
        e.pageTemplateKey === data.pageTemplateKey &&
        e.bagTemplateKey === data.bagTemplateKey &&
        e.sameColour === data.sameColour &&
        (e.endedAt === null) === (endedAt === null);
      if (same) continue;
      await tx.combo.update({ where: { id: e.id }, data: { ...data, endedAt, version: { increment: 1 } } });
      updated++;
    }
    for (const e of existing) {
      if (e.pieceKey && !made.has(e.pieceKey) && e.status !== 'ENDED') {
        await tx.combo.update({ where: { id: e.id }, data: { status: 'ENDED', endedAt: ctx.now, version: { increment: 1 } } });
        ended++;
      }
    }
    await tx.comboAutoRule.update({ where: { id: r.id }, data: { lastGeneratedAt: ctx.now } });
    if (who && (created || ended)) await logChange(tx, who, { action: 'combo.rule.generate', entityType: 'ComboAutoRule', entityId: r.id, before: null, after: { made: gen.all.length, created, updated, ended } });
    return { ruleId: r.id, made: gen.all.length, created, updated, ended };
  }, TX);
}

/** Every rule of the store made again (the job after product, colour, price or stock changes; the CLI's `sync`). */
export async function syncStoreAutoRules(deps: CombosDeps, storeId: number): Promise<SyncReport[]> {
  const rules = await deps.db.comboAutoRule.findMany({ where: { storeId, archivedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const out: SyncReport[] = [];
  for (const r of rules) out.push(await syncRule(deps, storeId, r.id));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------

const blockingOf = (r: Pick<RuleRow, 'priceMode' | 'priceMinor' | 'percentOff'>, made: number) => [...(made ? [] : ['NO_PAIRS']), ...(packPriced(r) ? [] : ['NO_SET_PRICE'])];

async function boundNames(db: Db, storeId: number, rules: readonly Pick<RuleRow, 'sourceIds' | 'productIds'>[]) {
  const catIds = [...new Set(rules.flatMap((r) => r.sourceIds))];
  const prodIds = [...new Set(rules.flatMap((r) => r.productIds))];
  const [cats, prods] = await Promise.all([
    catIds.length ? db.category.findMany({ where: { storeId, id: { in: catIds } }, select: { id: true, nameEn: true, nameBn: true } }) : [],
    prodIds.length ? db.product.findMany({ where: { storeId, id: { in: prodIds } }, select: { id: true, nameEn: true, nameBn: true } }) : [],
  ]);
  const c = new Map(cats.map((x) => [x.id, x]));
  const p = new Map(prods.map((x) => [x.id, x]));
  return (r: Pick<RuleRow, 'sourceIds' | 'productIds'>): AutoRuleView['bound'] => [
    ...r.sourceIds.flatMap((id) => (c.has(id) ? [{ kind: 'category' as const, id, nameEn: c.get(id)!.nameEn, nameBn: c.get(id)!.nameBn }] : [])),
    ...r.productIds.flatMap((id) => (p.has(id) ? [{ kind: 'product' as const, id, nameEn: p.get(id)!.nameEn, nameBn: p.get(id)!.nameBn }] : [])),
  ];
}

async function ruleViews(deps: CombosDeps, storeId: number, rows: RuleRow[]): Promise<AutoRuleView[]> {
  const ctx = await genCtx(deps, storeId);
  const timeZone = await setting(deps, storeId, 'store.timeZone');
  const names = await boundNames(deps.db, storeId, rows);
  const all = rows.length ? await deps.db.comboAutoRule.findMany({ where: { storeId }, select: { id: true, key: true, name: true, nameBn: true, upsellRuleId: true, priceMode: true, priceMinor: true, percentOff: true, status: true, startsAt: true, endsAt: true } }) : [];
  const byId = new Map(all.map((x) => [x.id, x]));
  const out: AutoRuleView[] = [];
  for (const r of rows) {
    const { gen, facts, rows: pairRows } = await generateFor(deps, storeId, r, ctx);
    const rowByKey = new Map(pairRows.map((x) => [x.pieceKey, x.id]));
    const topPair = gen.visible[0] ?? gen.all[0];
    const up = r.upsellRuleId ? byId.get(r.upsellRuleId) : undefined;
    const of = all.find((x) => x.upsellRuleId === r.id);
    out.push({
      id: r.id,
      key: r.key,
      path: rulePath(r.key),
      nameEn: r.name,
      nameBn: r.nameBn,
      titleEn: r.titleEn,
      titleBn: r.titleBn,
      categoryIds: r.sourceIds,
      productIds: r.productIds,
      bound: names(r),
      pieces: r.pieces,
      pairing: r.pairing,
      sameColour: r.sameColour,
      excludeColourIds: r.excludeColourIds,
      priceMode: r.priceMode,
      priceMinor: r.priceMinor,
      percentOff: r.percentOff,
      sortMode: r.sortMode,
      pinnedKeys: r.pinnedKeys,
      season: r.season,
      listTemplateKey: r.listTemplateKey,
      pageTemplateKey: r.pageTemplateKey,
      bagTemplateKey: r.bagTemplateKey,
      noSinglePiece: r.noSinglePiece,
      addOneMore: r.addOneMore,
      upsell: up ? { id: up.id, key: up.key, nameEn: up.name, nameBn: up.nameBn, state: comboState(up, ctx.now), priced: packPriced(up) } : null,
      upsellOf: of ? { id: of.id, key: of.key, nameEn: of.name } : null,
      status: r.status,
      state: comboState(r, ctx.now),
      ...daysFromWindow(r, timeZone),
      counts: { made: gen.all.length, withStock: gen.visible.length, products: gen.products, truncated: gen.truncated },
      top: topPair ? pairView(topPair, r.key, facts, rowByKey.get(topPair.pieceKey) ?? null) : null,
      blocking: blockingOf(r, gen.all.length),
      lastGeneratedAt: r.lastGeneratedAt?.toISOString() ?? null,
      version: r.version,
    });
  }
  return out;
}

/** The store's auto rules (the Archive is the ended and switched-off ones), oldest first. */
export async function listAutoRules(deps: CombosDeps, who: Who): Promise<AutoRuleView[]> {
  await allow(deps, who, 'combos.read');
  const rows = await deps.db.comboAutoRule.findMany({ where: { storeId: who.storeId, archivedAt: null }, select: ruleSelect, orderBy: { createdAt: 'asc' } });
  return ruleViews(deps, who.storeId, rows);
}

export async function getAutoRule(deps: CombosDeps, who: Who, id: string): Promise<AutoRuleView> {
  await allow(deps, who, 'combos.read');
  const row = found(await deps.db.comboAutoRule.findFirst({ where: { id, storeId: who.storeId }, select: ruleSelect }), 'combo rule');
  return (await ruleViews(deps, who.storeId, [row]))[0]!;
}

/** Every pair of a rule (the admin's "show all"), in the rule's order. */
export async function autoRulePairs(deps: CombosDeps, who: Who, id: string): Promise<PairView[]> {
  await allow(deps, who, 'combos.read');
  const r = found(await deps.db.comboAutoRule.findFirst({ where: { id, storeId: who.storeId }, select: ruleSelect }), 'combo rule');
  const { gen, facts, rows } = await generateFor(deps, who.storeId, r, await genCtx(deps, who.storeId));
  const rowByKey = new Map(rows.map((x) => [x.pieceKey, x.id]));
  return gen.all.map((p) => pairView(p, r.key, facts, rowByKey.get(p.pieceKey) ?? null));
}

export interface RulePreview {
  counts: RuleCounts;
  pairs: PairView[];
  /** Pairs with 2 and with 3 pieces (the wizard's step 2). */
  byPieces: Record<'2' | '3', number>;
  /** Pairs by pairing (step 3). */
  byPairing: Record<'STYLE' | 'ACROSS' | 'ANY', number>;
  /** Styles the bound products make (one from each style needs as many styles as pieces). */
  styles: number;
  /** Every colour of the bound products (the colours to leave out, step 3). */
  colours: { id: string; key: string; nameEn: string; nameBn: string | null; hex: string }[];
  /** "Add 1 more": the 3-piece pairs, and the first one's price. */
  upsell: { made: number; top: PairView | null } | null;
}

/** The wizard's live count and preview of a rule not saved (or being changed). Nothing is written. */
export async function previewAutoRule(deps: CombosDeps, who: Who, input: Partial<AutoRuleInput>): Promise<RulePreview> {
  await allow(deps, who, 'combos.read');
  const d = parse(autoRuleInputSchema, { key: 'preview', nameEn: 'preview', ...input }, 'combo rule');
  const ctx = await genCtx(deps, who.storeId);
  const base = { key: d.key, sourceIds: d.categoryIds, productIds: d.productIds, pieces: d.pieces, pairing: d.pairing, sameColour: d.sameColour, excludeColourIds: d.excludeColourIds, priceMode: d.priceMode, priceMinor: d.priceMinor, percentOff: d.percentOff, sortMode: d.sortMode, pinnedKeys: d.pinnedKeys };
  const { gen, facts } = await generateFor(deps, who.storeId, base, ctx);
  const ordered = [...facts.values()];
  const count = (over: Partial<GenRule>) => generatePairs({ ...genRule(base), ...over }, ordered, NO_SALES, ctx).all.length;
  const shown = await setting(deps, who.storeId, 'combos.admin.previewCount');
  const seen = new Set<string>();
  const colours = ordered.flatMap((p) => p.colours.filter((c) => !seen.has(c.id) && seen.add(c.id)).map((c) => ({ id: c.id, key: c.key, nameEn: c.nameEn, nameBn: c.nameBn, hex: c.hex })));
  let upsell: RulePreview['upsell'] = null;
  if (d.upsell && d.pieces === 2) {
    const g3 = generatePairs({ ...genRule(base), pieces: 3, price: packRule(d.upsell) }, ordered, NO_SALES, ctx);
    upsell = { made: g3.all.length, top: g3.all[0] ? pairView(g3.all[0], d.key, facts, null) : null };
  }
  return {
    counts: { made: gen.all.length, withStock: gen.visible.length, products: gen.products, truncated: gen.truncated },
    pairs: gen.all.slice(0, shown).map((p) => pairView(p, d.key, facts, null)),
    byPieces: { '2': count({ pieces: 2 }), '3': count({ pieces: 3 }) },
    byPairing: { STYLE: count({ pairing: 'STYLE' }), ACROSS: count({ pairing: 'ACROSS' }), ANY: count({ pairing: 'ANY' }) },
    styles: new Set(ordered.filter((p) => p.inCombos).map((p) => p.styleKey)).size,
    colours,
    upsell,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------------------------

async function checkPack(deps: CombosDeps, storeId: number, p: { priceMode: 'FIXED' | 'PERCENT'; percentOff: number | null }, field: string): Promise<void> {
  if (p.priceMode !== 'PERCENT' || p.percentOff === null) return;
  const max = await setting(deps, storeId, 'rules.discount.maxPercentOff');
  if (p.percentOff > max) throw new CombosError('INVALID_INPUT', 'the share off is above the store’s limit', [`${field}: at most ${max}`]);
}

/** The bound categories and products, and the left-out colours, are the store's. */
async function checkBinding(db: Db, storeId: number, d: AutoRuleData): Promise<void> {
  const bad: string[] = [];
  const [cats, prods, cols] = await Promise.all([
    d.categoryIds.length ? db.category.count({ where: { storeId, id: { in: d.categoryIds }, archivedAt: null } }) : 0,
    d.productIds.length ? db.product.count({ where: { storeId, id: { in: d.productIds }, archivedAt: null } }) : 0,
    d.excludeColourIds.length ? db.colour.count({ where: { storeId, id: { in: d.excludeColourIds } } }) : 0,
  ]);
  if (cats !== new Set(d.categoryIds).size) bad.push('categoryIds: not a category of this store');
  if (prods !== new Set(d.productIds).size) bad.push('productIds: not a product of this store');
  if (cols !== new Set(d.excludeColourIds).size) bad.push('excludeColourIds: not a colour');
  if (bad.length) throw new CombosError('INVALID_INPUT', 'the rule’s binding is not valid', bad);
}

const priceOf = (x: { priceMode: string; priceMinor: number | null; percentOff: number | null }) => `${x.priceMode}:${x.priceMode === 'FIXED' ? x.priceMinor : x.percentOff}`;

function ruleData(d: AutoRuleData, timeZone: string) {
  return {
    name: d.nameEn,
    nameBn: d.nameBn,
    titleEn: d.titleEn,
    titleBn: d.titleBn,
    sourceType: d.productIds.length && !d.categoryIds.length ? 'products' : 'categories',
    sourceIds: d.categoryIds,
    productIds: d.productIds,
    pieces: d.pieces,
    pairing: d.pairing,
    sameColour: d.sameColour,
    excludeColourIds: d.excludeColourIds,
    priceMode: d.priceMode,
    priceMinor: d.priceMode === 'FIXED' ? d.priceMinor : null,
    percentOff: d.priceMode === 'PERCENT' ? d.percentOff : null,
    sortMode: d.sortMode,
    pinnedKeys: d.pinnedKeys,
    season: d.season,
    listTemplateKey: d.listTemplateKey,
    pageTemplateKey: d.pageTemplateKey,
    bagTemplateKey: d.bagTemplateKey,
    noSinglePiece: d.noSinglePiece,
    ...windowFromDays(d.startsOn, d.endsOn, timeZone),
  };
}

async function keyFree(db: Db, storeId: number, key: string): Promise<void> {
  if (await db.comboAutoRule.findFirst({ where: { storeId, key }, select: { id: true } })) throw new CombosError('SLUG_TAKEN', 'that rule link is already used', ['key']);
}

/** A free key for the "add 1 more" rule: `<key>-3`, then `<key>-3-2`, … */
async function companionKey(db: Db, storeId: number, key: string): Promise<string> {
  const base = `${key}-3`;
  for (let i = 1; ; i++) {
    const k = i === 1 ? base : `${base}-${i}`;
    if (!(await db.comboAutoRule.findFirst({ where: { storeId, key: k }, select: { id: true } }))) return k;
  }
}

/**
 * "Add 1 more → 3 pcs": the rule's 3-piece companion (same binding, pairing and colours), made once and kept; its price
 * is the one the owner typed (none = it waits, as a draft, for a price). Returns the companion's id.
 */
async function ensureCompanion(tx: Prisma.TransactionClient, who: Who, r: RuleRow, up: PackPrice & { nameEn: string; nameBn: string | null }): Promise<string> {
  const priced = { priceMode: up.priceMode, priceMinor: up.priceMode === 'FIXED' ? up.priceMinor : null, percentOff: up.priceMode === 'PERCENT' ? up.percentOff : null };
  const have = r.upsellRuleId ? await tx.comboAutoRule.findFirst({ where: { id: r.upsellRuleId, storeId: who.storeId }, select: { id: true, priceMode: true, priceMinor: true, percentOff: true } }) : null;
  if (have) {
    if (priceOf(have) !== priceOf(priced)) {
      await tx.comboAutoRule.update({ where: { id: have.id }, data: { ...priced, updatedById: actorId(who), version: { increment: 1 } } });
      await logChange(tx, who, { action: 'combo.rule.price', entityType: 'ComboAutoRule', entityId: have.id, before: have, after: priced });
    }
    return have.id;
  }
  const key = await companionKey(tx, who.storeId, r.key);
  const c = await tx.comboAutoRule.create({
    data: {
      storeId: who.storeId,
      key,
      name: up.nameEn,
      nameBn: up.nameBn,
      titleEn: r.titleEn,
      titleBn: r.titleBn,
      sourceType: 'companion',
      sourceIds: r.sourceIds,
      productIds: r.productIds,
      pieces: 3,
      pairing: r.pairing,
      sameColour: r.sameColour,
      excludeColourIds: r.excludeColourIds,
      ...priced,
      sortMode: r.sortMode,
      season: r.season,
      listTemplateKey: r.listTemplateKey,
      pageTemplateKey: r.pageTemplateKey,
      bagTemplateKey: r.bagTemplateKey,
      noSinglePiece: r.noSinglePiece,
      status: 'DRAFT',
      createdById: actorId(who),
      updatedById: actorId(who),
    },
    select: { id: true },
  });
  await logChange(tx, who, { action: 'combo.rule.create', entityType: 'ComboAutoRule', entityId: c.id, before: null, after: { key, companionOf: r.id, ...priced } });
  return c.id;
}

/** A new rule. It starts as a draft (its pairs are made, not on sale) until someone with `combos.publish` switches it on. */
export async function createAutoRule(deps: CombosDeps, who: Who, input: AutoRuleInput): Promise<AutoRuleView> {
  await allow(deps, who, 'combos.write');
  const d = parse(autoRuleInputSchema, input, 'combo rule');
  if (packPriced(d) || (d.upsell && packPriced(d.upsell))) await allowPrice(deps, who);
  await checkPack(deps, who.storeId, d, 'percentOff');
  if (d.upsell) await checkPack(deps, who.storeId, d.upsell, 'upsell.percentOff');
  const timeZone = await setting(deps, who.storeId, 'store.timeZone');
  const id = await deps.db.$transaction(async (tx) => {
    await keyFree(tx, who.storeId, d.key);
    await checkBinding(tx, who.storeId, d);
    const r = await tx.comboAutoRule.create({ data: { storeId: who.storeId, key: d.key, ...ruleData(d, timeZone), status: 'DRAFT', createdById: actorId(who), updatedById: actorId(who) }, select: ruleSelect });
    await logChange(tx, who, { action: 'combo.rule.create', entityType: 'ComboAutoRule', entityId: r.id, before: null, after: { ...d } });
    if (d.upsell) {
      const up = await ensureCompanion(tx, who, r, d.upsell);
      await tx.comboAutoRule.update({ where: { id: r.id }, data: { addOneMore: true, upsellRuleId: up } });
    }
    return r.id;
  }, TX);
  await syncAll(deps, who, id);
  return getAutoRule(deps, who, id);
}

/** The rule and its companion made again. */
async function syncAll(deps: CombosDeps, who: Who, id: string): Promise<void> {
  const r = await syncRule(deps, who.storeId, id, who);
  const up = await deps.db.comboAutoRule.findFirst({ where: { id: r.ruleId }, select: { upsellRuleId: true } });
  if (up?.upsellRuleId) await syncRule(deps, who.storeId, up.upsellRuleId, who);
}

/** Changes a rule (the whole form, with the version it was opened at). The link (key) never changes. */
export async function updateAutoRule(deps: CombosDeps, who: Who, id: string, input: AutoRuleInput, version?: number): Promise<AutoRuleView> {
  await allow(deps, who, 'combos.write');
  const d = parse(autoRuleInputSchema, input, 'combo rule');
  const before = found(await deps.db.comboAutoRule.findFirst({ where: { id, storeId: who.storeId }, select: ruleSelect }), 'combo rule');
  if (d.key !== before.key) throw new CombosError('KEY_FIXED', 'a rule’s link cannot change', ['key']);
  if (version !== undefined && version !== before.version) throw new CombosError('STALE', 'the rule was changed by someone else', [`version ${before.version}`]);
  const timeZone = await setting(deps, who.storeId, 'store.timeZone');
  const data = ruleData(d, timeZone);
  if (priceOf(data) !== priceOf(before) || d.upsell) await allowPrice(deps, who);
  await checkPack(deps, who.storeId, d, 'percentOff');
  if (d.upsell) await checkPack(deps, who.storeId, d.upsell, 'upsell.percentOff');
  await deps.db.$transaction(async (tx) => {
    await checkBinding(tx, who.storeId, d);
    const moved = await tx.comboAutoRule.updateMany({ where: { id, version: before.version }, data: { ...data, updatedById: actorId(who), version: { increment: 1 } } });
    if (moved.count !== 1) throw new CombosError('STALE', 'the rule was changed by someone else');
    if (d.upsell) {
      const up = await ensureCompanion(tx, who, before, d.upsell);
      await tx.comboAutoRule.update({ where: { id }, data: { addOneMore: true, upsellRuleId: up } });
    } else if (before.addOneMore) await tx.comboAutoRule.update({ where: { id }, data: { addOneMore: false } });
    await logChange(tx, who, { action: 'combo.rule.update', entityType: 'ComboAutoRule', entityId: id, before, after: { ...d } });
  }, TX);
  await syncAll(deps, who, id);
  return getAutoRule(deps, who, id);
}

/**
 * Switches a rule on (it must make pairs and have a price) or off (it moves to the Archive with its pairs; their
 * pages keep opening in the ended state). On again clears an end date that has passed: same links as before.
 */
export async function setAutoRuleActive(deps: CombosDeps, who: Who, id: string, on: boolean): Promise<AutoRuleView> {
  await allow(deps, who, 'combos.publish');
  const view = await getAutoRule(deps, who, id);
  if (on && view.blocking.length) throw new CombosError('NOT_READY', 'the rule cannot go on sale yet', view.blocking);
  const now = nowOf(deps);
  const row = found(await deps.db.comboAutoRule.findFirst({ where: { id, storeId: who.storeId }, select: { status: true, endsAt: true } }), 'combo rule');
  const pastEnd = Boolean(row.endsAt && row.endsAt <= now);
  if ((on && row.status === 'RUNNING' && !pastEnd) || (!on && row.status === 'PAUSED')) return view;
  const data: Prisma.ComboAutoRuleUpdateInput = on ? { status: 'RUNNING', ...(pastEnd ? { endsAt: null } : {}) } : { status: 'PAUSED' };
  await deps.db.$transaction(async (tx) => {
    await tx.comboAutoRule.update({ where: { id }, data: { ...data, updatedById: actorId(who), version: { increment: 1 } } });
    await logChange(tx, who, { action: on ? 'combo.rule.on' : 'combo.rule.off', entityType: 'ComboAutoRule', entityId: id, before: row, after: data });
  }, TX);
  await syncRule(deps, who.storeId, id, who);
  return getAutoRule(deps, who, id);
}

/** The card's dates (empty = always). Changing when it sells is a publishing decision: `combos.publish`. */
export async function setAutoRuleDates(deps: CombosDeps, who: Who, id: string, startsOn: string | null, endsOn: string | null): Promise<AutoRuleView> {
  await allow(deps, who, 'combos.publish');
  const days = parse(autoRuleShape.pick({ startsOn: true, endsOn: true }), { startsOn, endsOn }, 'dates');
  if (days.startsOn && days.endsOn && days.endsOn < days.startsOn) throw new CombosError('INVALID_INPUT', 'the end is before the start', ['endsOn']);
  const timeZone = await setting(deps, who.storeId, 'store.timeZone');
  const before = found(await deps.db.comboAutoRule.findFirst({ where: { id, storeId: who.storeId }, select: { startsAt: true, endsAt: true } }), 'combo rule');
  const data = windowFromDays(days.startsOn, days.endsOn, timeZone);
  await deps.db.$transaction(async (tx) => {
    await tx.comboAutoRule.update({ where: { id }, data: { ...data, updatedById: actorId(who), version: { increment: 1 } } });
    await logChange(tx, who, { action: 'combo.rule.dates', entityType: 'ComboAutoRule', entityId: id, before, after: data });
  }, TX);
  await syncRule(deps, who.storeId, id, who);
  return getAutoRule(deps, who, id);
}

/** The card's switches and template choices: no single pieces, and the rule's own page, pair page and bag templates. */
export async function setAutoRuleOptions(deps: CombosDeps, who: Who, id: string, patch: Partial<Pick<AutoRuleData, 'noSinglePiece' | 'listTemplateKey' | 'pageTemplateKey' | 'bagTemplateKey'>>): Promise<AutoRuleView> {
  await allow(deps, who, 'combos.write');
  const shape = autoRuleShape.pick({ noSinglePiece: true, listTemplateKey: true, pageTemplateKey: true, bagTemplateKey: true }).partial();
  const p = parse(shape, patch, 'rule options');
  const data = Object.fromEntries(Object.entries(p).filter(([k]) => k in (patch ?? {})));
  const before = found(await deps.db.comboAutoRule.findFirst({ where: { id, storeId: who.storeId }, select: { noSinglePiece: true, listTemplateKey: true, pageTemplateKey: true, bagTemplateKey: true } }), 'combo rule');
  if (Object.keys(data).length) {
    await deps.db.$transaction(async (tx) => {
      await tx.comboAutoRule.update({ where: { id }, data: { ...data, updatedById: actorId(who), version: { increment: 1 } } });
      await logChange(tx, who, { action: 'combo.rule.options', entityType: 'ComboAutoRule', entityId: id, before, after: data });
    }, TX);
    await syncRule(deps, who.storeId, id, who);
  }
  return getAutoRule(deps, who, id);
}

/**
 * The card's "Add 1 more → 3 pcs" switch (2-piece rules). On: the 3-piece companion is made when there is none (a
 * draft without a price — the owner prices it, then switches it on); off: the offer stops (the companion is kept).
 */
export async function setAutoRuleUpsell(deps: CombosDeps, who: Who, id: string, on: boolean, names: { nameEn?: string; nameBn?: string | null } = {}): Promise<AutoRuleView> {
  await allow(deps, who, 'combos.write');
  const r = found(await deps.db.comboAutoRule.findFirst({ where: { id, storeId: who.storeId }, select: ruleSelect }), 'combo rule');
  if (r.pieces !== 2) throw new CombosError('INVALID_INPUT', '"add 1 more" is for 2-piece rules', ['pieces']);
  if (on && !r.upsellRuleId && !names.nameEn?.trim()) throw new CombosError('INVALID_INPUT', 'the 3-piece rule needs a name', ['nameEn']);
  await deps.db.$transaction(async (tx) => {
    let upsellRuleId = r.upsellRuleId;
    if (on && !upsellRuleId) upsellRuleId = await ensureCompanion(tx, who, r, { priceMode: r.priceMode, priceMinor: null, percentOff: null, nameEn: names.nameEn!.trim(), nameBn: names.nameBn?.trim() || null });
    await tx.comboAutoRule.update({ where: { id }, data: { addOneMore: on, upsellRuleId, updatedById: actorId(who), version: { increment: 1 } } });
    await logChange(tx, who, { action: on ? 'combo.rule.upsell.on' : 'combo.rule.upsell.off', entityType: 'ComboAutoRule', entityId: id, before: { addOneMore: r.addOneMore }, after: { addOneMore: on, upsellRuleId } });
  }, TX);
  await syncAll(deps, who, id);
  return getAutoRule(deps, who, id);
}

// ---------------------------------------------------------------------------------------------------------------
// The shop's default templates (a rule may choose its own)
// ---------------------------------------------------------------------------------------------------------------

export interface ShopTemplates {
  list: string;
  page: string;
  bag: string;
}

export async function shopTemplates(deps: Pick<CombosDeps, 'settings'>, storeId: number): Promise<ShopTemplates> {
  const [list, page, bag] = await Promise.all([setting(deps, storeId, 'combos.template.list'), setting(deps, storeId, 'combos.template.page'), setting(deps, storeId, 'combos.template.bag')]);
  return { list, page, bag };
}

/** Saves the shop's default templates for this store (settings, logged as setting changes). */
export async function setShopTemplates(deps: CombosDeps, who: Who, patch: Partial<ShopTemplates>): Promise<ShopTemplates> {
  await allow(deps, who, 'combos.write');
  const write = deps.settings.set;
  if (!write) throw new CombosError('NOT_READY', 'settings cannot be written here');
  const keys = { list: 'combos.template.list', page: 'combos.template.page', bag: 'combos.template.bag' } as const;
  for (const [k, key] of Object.entries(keys) as [keyof ShopTemplates, (typeof keys)[keyof typeof keys]][]) {
    const v = patch[k];
    if (v === undefined) continue;
    try {
      await write.call(deps.settings, key, v as never, { level: 'store', storeId: who.storeId }, { actorId: actorId(who), reason: 'combos admin' });
    } catch (e) {
      throw new CombosError('INVALID_INPUT', 'not a template', [`${k}: ${(e as Error).message}`]);
    }
  }
  return shopTemplates(deps, who.storeId);
}
