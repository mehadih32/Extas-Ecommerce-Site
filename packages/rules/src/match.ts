// PR 208 — when a rule applies: its conditions over the cart's facts, and its scope over each line's product. And PR
// 217's resolution order: when two live rules want the same thing, the one first in this order wins —
//   1. higher priority;
//   2. the narrower scope (a product beats a collection, a collection beats a category, a category beats everything);
//   3. the newer start (a campaign that began later wins over the standing rule);
//   4. the key, A→Z (so the order is always the same).
//
// Pure module.
import { CONDITION_FIELDS, type Condition, type ConditionField, type Rule, type Scope, type Target } from './model';

/** The cart-level facts a condition reads (engine.ts builds them). */
export type ConditionFacts = Partial<Record<ConditionField, string | number | boolean | null>>;

const cmp = (a: unknown, b: unknown): number | null => (typeof a === 'number' && typeof b === 'number' ? a - b : typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : null);
const norm = (v: unknown, field: ConditionField) => (CONDITION_FIELDS[field] === 'text' && typeof v === 'string' ? v.trim().toUpperCase() : v);

export function conditionHolds(c: Condition, facts: ConditionFacts): boolean {
  if ('all' in c) return c.all.every((x) => conditionHolds(x, facts));
  if ('any' in c) return c.any.some((x) => conditionHolds(x, facts));
  if ('not' in c) return !conditionHolds(c.not, facts);
  const raw = facts[c.field];
  const have = raw === undefined ? null : norm(raw, c.field);
  const want = Array.isArray(c.value) ? c.value.map((v) => norm(v, c.field)) : norm(c.value, c.field);
  switch (c.op) {
    case 'exists':
      return have !== null && have !== '';
    case 'missing':
      return have === null || have === '';
    case 'eq':
      return have !== null && have === want;
    case 'ne':
      return have !== want;
    case 'in':
      return have !== null && Array.isArray(want) && want.includes(have);
    case 'notIn':
      return !(Array.isArray(want) && have !== null && want.includes(have));
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const d = cmp(have, want);
      if (d === null) return false;
      return c.op === 'gt' ? d > 0 : c.op === 'gte' ? d >= 0 : c.op === 'lt' ? d < 0 : d <= 0;
    }
  }
}

/** What the scope looks at on a line: the product, its categories (with their parents) and its collections. */
export interface ScopeFacts {
  productId: string | null;
  categoryIds: readonly string[];
  collectionIds: readonly string[];
}

const hits = (t: Target, f: ScopeFacts): boolean =>
  t.type === 'all' ? true : t.type === 'product' ? f.productId === t.id : t.type === 'category' ? f.categoryIds.includes(t.id) : f.collectionIds.includes(t.id);

export function inScope(scope: Scope, f: ScopeFacts): boolean {
  return scope.include.some((t) => hits(t, f)) && !scope.exclude.some((t) => hits(t, f));
}

const SPECIFICITY: Record<Target['type'], number> = { all: 0, category: 1, collection: 2, product: 3 };

/** How narrow a scope is: its broadest include decides (a scope that includes everything is the broadest). */
export function specificity(scope: Scope): number {
  return Math.min(...scope.include.map((t) => SPECIFICITY[t.type]));
}

export type OrderedRule = Pick<Rule, 'priority' | 'scope' | 'startsAt' | 'key'>;

/** The resolution order (PR 217): negative when `a` wins over `b`. */
export function resolutionOrder(a: OrderedRule, b: OrderedRule): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const s = specificity(b.scope) - specificity(a.scope);
  if (s !== 0) return s;
  const sa = a.startsAt ? Date.parse(a.startsAt) : -Infinity;
  const sb = b.startsAt ? Date.parse(b.startsAt) : -Infinity;
  if (sa !== sb) return sb > sa ? 1 : -1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Which step of the order decided between two rules (the admin explains the winner with it). */
export function decidedBy(a: OrderedRule, b: OrderedRule): 'priority' | 'scope' | 'start' | 'key' {
  if (a.priority !== b.priority) return 'priority';
  if (specificity(a.scope) !== specificity(b.scope)) return 'scope';
  if ((a.startsAt ?? '') !== (b.startsAt ?? '')) return 'start';
  return 'key';
}

/** Could two scopes cover the same product? Conservative: true unless provably apart. */
export function scopesOverlap(a: Scope, b: Scope, parents: ReadonlyMap<string, string | null> = new Map()): boolean {
  const all = (s: Scope) => s.include.some((t) => t.type === 'all');
  if (all(a) || all(b)) return true;
  const kinds = (s: Scope) => new Set(s.include.map((t) => t.type));
  const ka = kinds(a);
  const kb = kinds(b);
  // Only two category-only scopes (or two product-only scopes) can be shown to be apart.
  const only = (k: Set<string>, t: string) => k.size === 1 && k.has(t);
  if (only(ka, 'product') && only(kb, 'product')) {
    const ids = new Set(a.include.map((t) => (t as { id: string }).id));
    return b.include.some((t) => ids.has((t as { id: string }).id));
  }
  if (only(ka, 'category') && only(kb, 'category')) {
    const line = (id: string) => {
      const out = new Set<string>();
      for (let cur: string | null | undefined = id, guard = 0; cur && guard < 64; cur = parents.get(cur), guard++) out.add(cur);
      return out;
    };
    for (const ta of a.include) {
      const la = line((ta as { id: string }).id);
      for (const tb of b.include) {
        const idb = (tb as { id: string }).id;
        // Same category, or one inside the other.
        if (la.has(idb) || line(idb).has((ta as { id: string }).id)) return true;
      }
    }
    return false;
  }
  return true;
}

/** Can two condition sets both hold at once? false only when a field is pinned to different values in both. */
export function conditionsCanMeet(a: Condition, b: Condition): boolean {
  const pins = (c: Condition): Map<string, unknown[]> => {
    const out = new Map<string, unknown[]>();
    const leaves = 'all' in c ? c.all : 'any' in c || 'not' in c ? [] : [c];
    for (const l of leaves) {
      if (!('field' in l)) continue;
      if (l.op === 'eq') out.set(l.field, [norm(l.value, l.field)]);
      else if (l.op === 'in' && Array.isArray(l.value)) out.set(l.field, l.value.map((v) => norm(v, l.field)));
    }
    return out;
  };
  const pa = pins(a);
  const pb = pins(b);
  for (const [field, va] of pa) {
    const vb = pb.get(field);
    if (vb && !va.some((v) => vb.includes(v))) return false;
  }
  return true;
}
