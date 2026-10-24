// PR 99 — "What customers can combine": the set tiers (any 2 for X, any 3 for Y) read from Smart Rules, the one place
// they are written (S10 · PR 212, rule kind `setTier`). The combos admin shows them; their prices and switches change
// in Smart Rules only, where a price change needs the owner's OK (CLAUDE.md rule 6) — so there is one source and one
// approval. The old `SetTierRule` table (S03 schema) is kept, never written (nothing is deleted).
//
//   listSetTiers   the admin's cards: every setTier rule that is not archived, with its state, tiers (a tier with no
//                  price is "not offered"), what it covers by name and how many products that is
//   liveSetTiers   the storefront's (set builder, product page, bag): only live rules, only priced tiers, optionally
//                  only those that cover one product — no permission, nothing that is not on sale
import { activeRules, categoryParents, inScope, isLive, loadRules, scopeFacts, valueOf, type Rule, type Scope, type Target } from '@extas/rules';
import { allow, nowOf, type CombosDeps, type Who } from './context';
import { comboState, type ComboState } from './model';
import { pricedTiers, tierEachMinor, type PricedTier } from './tiers';

export interface TierTargetView {
  type: Target['type'];
  id: string | null;
  nameEn: string;
  nameBn: string | null;
}

export interface SetTierTier {
  quantity: number;
  /** null = not offered (the price is not set in Smart Rules). */
  priceMinor: number | null;
  eachMinor: number | null;
}

export interface SetTierView {
  ruleId: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  state: ComboState;
  tiers: SetTierTier[];
  /** Every tier priced (a live rule with a tier unpriced still sells the priced ones). */
  allPriced: boolean;
  include: TierTargetView[];
  exclude: TierTargetView[];
  /** Published products the rule covers. */
  products: number;
  startsAt: string | null;
  endsAt: string | null;
  /** The Smart Rules version (changes there show here). */
  version: number;
}

export interface LiveSetTier {
  ruleId: string;
  key: string;
  nameEn: string;
  nameBn: string | null;
  scope: Scope;
  tiers: PricedTier[];
  endsAt: string | null;
}

/** Smart Rules' status in the combos' words (ACTIVE = switched on). */
const statusOf = (r: Rule) => (r.status === 'ACTIVE' ? 'RUNNING' : r.status);

/** A set tier rule's tiers with their prices from Smart Rules (null = not offered). */
export function tiersOf(rule: Rule): SetTierTier[] {
  const out: SetTierTier[] = [];
  for (const a of rule.actions) {
    if (a.type !== 'setTier') continue;
    for (const t of a.tiers) {
      const v = valueOf<number>(rule, t.param);
      out.push({ quantity: t.quantity, priceMinor: v, eachMinor: v === null ? null : tierEachMinor({ quantity: t.quantity, priceMinor: v }) });
    }
  }
  return out.sort((x, y) => x.quantity - y.quantity);
}

async function targetNames(deps: CombosDeps, storeId: number, rules: readonly Rule[]): Promise<Map<string, { nameEn: string; nameBn: string | null }>> {
  const ids = (type: Target['type']) => [...new Set(rules.flatMap((r) => [...r.scope.include, ...r.scope.exclude]).flatMap((t) => (t.type !== 'all' && t.type === type ? [t.id] : [])))];
  const [cats, cols, prods] = await Promise.all([
    deps.db.category.findMany({ where: { storeId, id: { in: ids('category') } }, select: { id: true, nameEn: true, nameBn: true } }),
    deps.db.collection.findMany({ where: { storeId, id: { in: ids('collection') } }, select: { id: true, nameEn: true, nameBn: true } }),
    deps.db.product.findMany({ where: { storeId, id: { in: ids('product') } }, select: { id: true, nameEn: true, nameBn: true } }),
  ]);
  return new Map([...cats, ...cols, ...prods].map((x) => [x.id, { nameEn: x.nameEn, nameBn: x.nameBn }]));
}

const targetView = (t: Target, names: ReadonlyMap<string, { nameEn: string; nameBn: string | null }>): TierTargetView =>
  t.type === 'all' ? { type: 'all', id: null, nameEn: '', nameBn: null } : { type: t.type, id: t.id, nameEn: names.get(t.id)?.nameEn ?? '', nameBn: names.get(t.id)?.nameBn ?? null };

/** The admin's "What customers can combine" (needs `combos.read`; changes are made in Smart Rules). */
export async function listSetTiers(deps: CombosDeps, who: Who): Promise<SetTierView[]> {
  await allow(deps, who, 'combos.read');
  const now = nowOf(deps);
  const rules = (await loadRules(deps.db, who.storeId)).rules.filter((r) => r.kind === 'setTier' && !r.archived);
  if (!rules.length) return [];
  const [names, published, parents] = await Promise.all([
    targetNames(deps, who.storeId, rules),
    deps.db.product.findMany({ where: { storeId: who.storeId, archivedAt: null, status: 'PUBLISHED' }, select: { id: true } }),
    categoryParents(deps.db, who.storeId),
  ]);
  const facts = [...(await scopeFacts(deps.db, who.storeId, published.map((p) => p.id), parents)).values()];
  return rules.map((r) => {
    const tiers = tiersOf(r);
    return {
      ruleId: r.id,
      key: r.key,
      nameEn: r.nameEn,
      nameBn: r.nameBn ?? null,
      state: comboState({ status: statusOf(r), startsAt: r.startsAt ? new Date(r.startsAt) : null, endsAt: r.endsAt ? new Date(r.endsAt) : null }, now),
      tiers,
      allPriced: tiers.length > 0 && tiers.every((t) => t.priceMinor !== null),
      include: r.scope.include.map((t) => targetView(t, names)),
      exclude: r.scope.exclude.map((t) => targetView(t, names)),
      products: facts.filter((f) => inScope(r.scope, f)).length,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      version: r.version,
    };
  });
}

/** The live set tiers for the shop (no permission; only what is on sale now, only priced tiers). */
export async function liveSetTiers(deps: CombosDeps, input: { storeId: number; productId?: string | null }): Promise<LiveSetTier[]> {
  const now = nowOf(deps);
  const rules = (await activeRules(deps.db, input.storeId)).filter((r) => r.kind === 'setTier' && isLive(r, now));
  let mine = rules;
  if (input.productId) {
    const f = (await scopeFacts(deps.db, input.storeId, [input.productId])).get(input.productId);
    mine = f ? rules.filter((r) => inScope(r.scope, f)) : [];
  }
  return mine.flatMap((r) => {
    const tiers = pricedTiers(tiersOf(r));
    return tiers.length ? [{ ruleId: r.id, key: r.key, nameEn: r.nameEn, nameBn: r.nameBn ?? null, scope: r.scope, tiers, endsAt: r.endsAt }] : [];
  });
}
