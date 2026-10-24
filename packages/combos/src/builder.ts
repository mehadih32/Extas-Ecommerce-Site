// PR 98, 100 — "Build your own set" on the server (Blueprint D3.9, demo 41-set.js): the customer picks any pieces of a
// set group and the set price applies by itself. A group is one set tier rule of Smart Rules (`setTier`, S10 · PR 212;
// "any 2 for X, any 3 for Y", read by PR 99) — its prices and its switch are written there only, with the owner's OK —
// and its products are the published ones the rule covers, narrowed by `combos.builder` (the builder's own switch,
// off by default; which rules; which categories; how many styles).
//
//   setBuilder          the page: the groups with their tiers and products (colours, sizes, every variant's own price
//                       and what can be sold now), and what the bag already holds; no permission, only what is on sale
//   addBuiltSetToBag    "Add set to Bag": one write, one tap. The pieces go into the bag as ordinary lines at their own
//                       prices, and the bag's rules engine applies the same set tiers to them — so the set price is
//                       the same in the builder, the bag's tier box, the bag and checkout (Blueprint D3.11), and a piece
//                       taken out later re-prices the rest honestly. The tap's key makes a resent tap the same add
//                       (SetBuilderAdd); the check runs again inside the write against live stock and the bag (no
//                       oversell); prices are never taken from the browser.
//   builderAdmin        the admin's view (combos.read): the builder's switches, every set tier rule with whether the
//   setBuilderOptions   builder offers it, and what customers built (adds, pieces, per rule); changing the switches
//                       needs combos.publish (it opens a page to customers). The screen comes on the new admin shell.
import { randomUUID } from 'node:crypto';
import { activeRules, categoryParents, inScope, isLive, loadRules, scopeFacts, type Rule } from '@extas/rules';
import { setBuilderSchema, type SetBuilderSettings } from '@extas/settings';
import { z } from 'zod';
import { openCart } from './bag';
import { checkBuild, picksByVariant, type BuildVariant } from './builder-model';
import { actorId, allow, checkStoreId, nowOf, parse, setting, TX, type CombosDeps, type Db, type Who } from './context';
import { CombosError } from './errors';
import { productFacts, type ColourFact, type SizeFact } from './facts';
import { bagUse } from './set-check';
import { listSetTiers, tiersOf, type SetTierView } from './set-tiers';
import { wasAllowed } from './summary';
import { pricedTiers, type PricedTier } from './tiers';

/** Where the bag lines of a built set came from (PR 338 events). */
export const BUILD_SOURCE = 'set';

/** The most products one store's builder looks through (the best-ranked first). */
const SCAN_LIMIT = 2_000;

export interface BuilderProduct {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  colours: ColourFact[];
  sizes: SizeFact[];
  variants: BuildVariant[];
}

export interface BuilderGroup {
  ruleId: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  tiers: PricedTier[];
  endsAt: string | null;
  products: BuilderProduct[];
  /** A rule that is not switched on yet, shown only to a test server's preview. */
  draft: boolean;
}

export interface SetBuilder {
  /** The builder is open (its switch on, or a test server's preview). */
  on: boolean;
  preview: boolean;
  settings: SetBuilderSettings;
  /** The bag's most pieces of one item. */
  maxPerLine: number;
  /** The separate prices' sum may show struck (`rules.discount.showWasPrice`, the owner's switch, CN-009). */
  showWas: boolean;
  groups: BuilderGroup[];
  /** Pieces of each variant the customer's bag holds already. */
  inBag: Record<string, number>;
}

/** The rules the builder offers: live set tiers with a price (a preview also shows drafts), in the setting's order. */
async function builderRules(deps: CombosDeps, db: Db, storeId: number, s: SetBuilderSettings, preview: boolean): Promise<{ rule: Rule; tiers: PricedTier[]; draft: boolean }[]> {
  const now = nowOf(deps);
  const rules = preview
    ? (await loadRules(db, storeId)).rules.filter((r) => r.kind === 'setTier' && !r.archived && (r.status === 'ACTIVE' || r.status === 'DRAFT') && !(r.endsAt && new Date(r.endsAt) <= now))
    : (await activeRules(db, storeId)).filter((r) => r.kind === 'setTier' && isLive(r, now));
  const chosen = s.rules.length ? s.rules.flatMap((k) => rules.filter((r) => r.key === k)) : rules;
  return chosen.flatMap((rule) => {
    const tiers = pricedTiers(tiersOf(rule));
    return tiers.length ? [{ rule, tiers, draft: rule.status !== 'ACTIVE' }] : [];
  });
}

const inCategories = (s: SetBuilderSettings, categoryIds: readonly string[]) => !s.categories.length || categoryIds.some((c) => s.categories.includes(c));

const variantsOf = (p: { id: string; variants: readonly { id: string; colourId: string | null; sizeId: string | null; sellable: number; priceMinor: number | null }[] }): BuildVariant[] =>
  p.variants.map((v) => ({ id: v.id, productId: p.id, colourId: v.colourId, sizeId: v.sizeId, sellable: v.sellable, priceMinor: v.priceMinor }));

/**
 * The builder page. `preview` is for a test server only (the app passes it behind EXTAS_SHOP_TEST_PAGES): the page as
 * it will look once switched on, with the draft set tier rules too. `cartId` counts what the bag holds already.
 */
export async function setBuilder(deps: CombosDeps, input: { storeId: number; cartId?: string | null; preview?: boolean }): Promise<SetBuilder> {
  checkStoreId(input.storeId);
  const preview = input.preview === true;
  const [s, maxPerLine, showWas] = await Promise.all([setting(deps, input.storeId, 'combos.builder'), setting(deps, input.storeId, 'inventory.reservation.maxUnitsPerLine'), wasAllowed(deps, input.storeId)]);
  const on = s.on || preview;
  const empty: SetBuilder = { on, preview, settings: s, maxPerLine, showWas, groups: [], inBag: {} };
  if (!on) return empty;
  const rules = await builderRules(deps, deps.db, input.storeId, s, preview);
  if (!rules.length) return empty;
  const published = await deps.db.product.findMany({
    where: { storeId: input.storeId, status: 'PUBLISHED', archivedAt: null },
    orderBy: [{ sortRank: 'desc' }, { nameEn: 'asc' }],
    select: { id: true },
    take: SCAN_LIMIT,
  });
  const scope = await scopeFacts(
    deps.db,
    input.storeId,
    published.map((p) => p.id),
    await categoryParents(deps.db, input.storeId),
  );
  const pickedIds = rules.map(({ rule }) => published.filter((p) => {
    const f = scope.get(p.id);
    return f && inScope(rule.scope, f) && inCategories(s, f.categoryIds);
  }).map((p) => p.id));
  const facts = await productFacts(deps, input.storeId, [...new Set(pickedIds.flat())]);
  const groups = rules.map(({ rule, tiers, draft }, i): BuilderGroup => ({
    ruleId: rule.id,
    key: rule.key,
    nameEn: rule.nameEn,
    nameBn: rule.nameBn ?? null,
    tiers,
    endsAt: rule.endsAt,
    draft,
    products: pickedIds[i]!.flatMap((id) => {
      const f = facts.get(id);
      if (!f?.published || !f.variants.some((v) => v.priceMinor !== null)) return [];
      return [{ id: f.id, slug: f.slug, nameEn: f.nameEn, nameBn: f.nameBn, colours: f.colours, sizes: f.sizes, variants: variantsOf(f) }];
    }).slice(0, s.maxStyles),
  }));
  const inBag = await bagUse(deps.db, input.storeId, input.cartId ?? undefined);
  return { ...empty, groups: groups.filter((g) => g.products.length > 0), inBag };
}

/** The builder's offer without its products (its entries on other pages): whether it is open with its entries on,
 * and the tiers of each rule it offers (one read of the rules, no catalogue scan). */
export async function builderOffer(deps: CombosDeps, storeId: number): Promise<{ open: boolean; groups: { key: string; tiers: PricedTier[] }[] }> {
  checkStoreId(storeId);
  const s = await setting(deps, storeId, 'combos.builder');
  if (!s.on || !s.entries) return { open: false, groups: [] };
  const rules = await builderRules(deps, deps.db, storeId, s, false);
  return { open: rules.length > 0, groups: rules.map((r) => ({ key: r.rule.key, tiers: r.tiers })) };
}

// ---------------------------------------------------------------------------------------------------------------
// "Add set to Bag"
// ---------------------------------------------------------------------------------------------------------------

export const addBuiltSetSchema = z
  .object({
    storeId: z.int().min(1),
    cartId: z.uuid(),
    /** The set tier rule (the group) the set was built in. */
    ruleId: z.uuid(),
    /** One variant per piece, in the order they were put in. */
    picks: z.array(z.uuid()).min(1).max(50),
    /** One key per tap, made by the page: the same key twice is the same add. */
    addKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/).optional(),
  })
  .strict();
export type AddBuiltSetInput = z.input<typeof addBuiltSetSchema>;

export interface AddedBuiltSet {
  /** false = this was the same tap again: nothing new went in. */
  added: boolean;
  pieces: number;
  /** The bag lines the pieces are on. */
  lineIds: string[];
  /** What the builder's set price was for these pieces (the bag prices them with the same rule). */
  regularMinor: number;
  payMinor: number;
}

/** Puts a built set into the bag (or returns the same add when it is the same tap again). */
export async function addBuiltSetToBag(deps: CombosDeps, input: AddBuiltSetInput): Promise<AddedBuiltSet> {
  const d = parse(addBuiltSetSchema, input, 'set');
  checkStoreId(d.storeId);
  return deps.db.$transaction(async (tx) => {
    await openCart(tx, d.storeId, d.cartId);
    const addKey = d.addKey ?? randomUUID();
    const again = await tx.setBuilderAdd.findUnique({ where: { cartId_addKey: { cartId: d.cartId, addKey } } });
    if (again) {
      const lines = await tx.cartItem.findMany({ where: { storeId: d.storeId, cartId: d.cartId, variantId: { in: again.variantIds }, comboGroupKey: null, removedAt: null }, select: { id: true } });
      return { added: false, pieces: again.pieces, lineIds: lines.map((l) => l.id), regularMinor: again.regularMinor, payMinor: again.payMinor };
    }
    const [s, maxPerLine] = await Promise.all([setting(deps, d.storeId, 'combos.builder'), setting(deps, d.storeId, 'inventory.reservation.maxUnitsPerLine')]);
    const found = s.on ? (await builderRules(deps, tx, d.storeId, s, false)).find((r) => r.rule.id === d.ruleId) : undefined;
    // the builder switched off, or this group no longer offered (its rule paused, ended or taken off the builder)
    if (!found) throw new CombosError('SET_INVALID', 'this set group is not offered now', ['NOT_ON']);
    // the group's variants among the picks: their products must be published, in the rule and in the builder's categories
    const picked = await tx.productVariant.findMany({ where: { storeId: d.storeId, id: { in: [...new Set(d.picks)] } }, select: { productId: true } });
    const productIds = [...new Set(picked.map((v) => v.productId))];
    const [scope, facts] = await Promise.all([scopeFacts(tx, d.storeId, productIds), productFacts({ db: tx, settings: deps.settings }, d.storeId, productIds)]);
    const variants = [...facts.values()].flatMap((f) => {
      const sf = scope.get(f.id);
      return f.published && sf && inScope(found.rule.scope, sf) && inCategories(s, sf.categoryIds) ? variantsOf(f) : [];
    });
    const inBag = await bagUse(tx, d.storeId, d.cartId);
    const check = checkBuild({ picks: d.picks, variants, tiers: found.tiers, inBag, on: true, maxPerLine });
    if (!check.ok) throw new CombosError('SET_INVALID', 'the set cannot go in the bag as picked', check.problems.map((p) => (p.pick === null ? p.code : `${p.code}@${p.pick}`)));
    const price = new Map(variants.map((v) => [v.id, v.priceMinor!]));
    const at = nowOf(deps);
    const lineIds: string[] = [];
    for (const { variantId, quantity } of picksByVariant(d.picks)) {
      const same = await tx.cartItem.findFirst({ where: { storeId: d.storeId, cartId: d.cartId, variantId, comboGroupKey: null, savedForLater: false, removedAt: null }, orderBy: { updatedAt: 'desc' } });
      const line = same
        ? await tx.cartItem.update({ where: { id: same.id }, data: { quantity: same.quantity + quantity, updatedAt: at }, select: { id: true } })
        : await tx.cartItem.create({ data: { storeId: d.storeId, cartId: d.cartId, variantId, quantity, unitPriceMinor: price.get(variantId)!, source: BUILD_SOURCE, createdAt: at, updatedAt: at }, select: { id: true } });
      lineIds.push(line.id);
    }
    await tx.cart.update({ where: { id: d.cartId }, data: { lastActivityAt: at } });
    await tx.setBuilderAdd.create({
      data: { storeId: d.storeId, cartId: d.cartId, addKey, ruleId: found.rule.id, ruleKey: found.rule.key, variantIds: d.picks, pieces: d.picks.length, regularMinor: check.quote.regularMinor, payMinor: check.quote.payMinor, createdAt: at },
    });
    return { added: true, pieces: d.picks.length, lineIds, regularMinor: check.quote.regularMinor, payMinor: check.quote.payMinor };
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------
// The admin's view (the screen comes on the new admin shell)
// ---------------------------------------------------------------------------------------------------------------

export interface BuilderAdminRule extends SetTierView {
  /** The builder offers this rule (its switch is on, and it is in `rules` or `rules` is empty). */
  offered: boolean;
}

export interface BuilderAdminReport {
  ruleKey: string;
  /** Sets put into bags. */
  adds: number;
  pieces: number;
  /** The builder's prices at those moments, added up. */
  regularMinor: number;
  payMinor: number;
}

export interface BuilderAdmin {
  settings: SetBuilderSettings;
  rules: BuilderAdminRule[];
  days: number;
  report: BuilderAdminReport[];
}

const daysSchema = z.int().min(1).max(366);

/** The builder's switches, the set tier rules it can offer and what customers built in the last `days` (combos.read). */
export async function builderAdmin(deps: CombosDeps, who: Who, input: { days?: number } = {}): Promise<BuilderAdmin> {
  await allow(deps, who, 'combos.read');
  const days = parse(daysSchema, input.days ?? 30, 'days');
  const [s, tiers] = await Promise.all([setting(deps, who.storeId, 'combos.builder'), listSetTiers(deps, who)]);
  const since = new Date(nowOf(deps).getTime() - days * 86_400_000);
  const rows = await deps.db.setBuilderAdd.groupBy({
    by: ['ruleKey'],
    where: { storeId: who.storeId, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { pieces: true, regularMinor: true, payMinor: true },
    orderBy: { ruleKey: 'asc' },
  });
  return {
    settings: s,
    rules: tiers.map((t) => ({ ...t, offered: s.on && t.state === 'live' && t.tiers.some((x) => x.priceMinor !== null) && (!s.rules.length || s.rules.includes(t.key)) })),
    days,
    report: rows.map((r) => ({ ruleKey: r.ruleKey, adds: r._count._all, pieces: r._sum.pieces ?? 0, regularMinor: r._sum.regularMinor ?? 0, payMinor: r._sum.payMinor ?? 0 })),
  };
}

/** Changes the builder's switches (combos.publish: it opens a page to customers). Prices stay in Smart Rules. */
export async function setBuilderOptions(deps: CombosDeps, who: Who, patch: Partial<SetBuilderSettings>): Promise<SetBuilderSettings> {
  await allow(deps, who, 'combos.publish');
  const write = deps.settings.set;
  if (!write) throw new CombosError('NOT_READY', 'settings cannot be written here');
  const current = await setting(deps, who.storeId, 'combos.builder');
  const next = setBuilderSchema.safeParse({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
  if (!next.success) throw new CombosError('INVALID_INPUT', 'not a setting of the set builder', next.error.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`));
  await write.call(deps.settings, 'combos.builder', next.data as never, { level: 'store', storeId: who.storeId }, { actorId: actorId(who), reason: 'combos admin: set builder' });
  return setting(deps, who.storeId, 'combos.builder');
}
