// S28 · PR 684 — when a category's demo products show. Pure, so the admin page, the reconcile step and the tests read one
// rule: the master switch is on; neither the category nor any category above it is turned off; and (when "hide by
// itself" is on) the category and everything under it have fewer real products than the limit.
export interface DemoCategory {
  id: string;
  parentId: string | null;
}
export interface DemoRule {
  on: boolean;
  off: readonly string[];
  auto: boolean;
  autoN: number;
}

/** The category and every category above it, nearest first. */
export function ancestorsOf(id: string, byId: ReadonlyMap<string, DemoCategory>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let c = byId.get(id); c && !seen.has(c.id); c = c.parentId ? byId.get(c.parentId) : undefined) {
    seen.add(c.id);
    out.push(c.id);
  }
  return out;
}

/** Real products in a category and every category under it. */
export function realInBranch(id: string, cats: readonly DemoCategory[], realBy: ReadonlyMap<string, number>): number {
  const kids = new Map<string, string[]>();
  for (const c of cats) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
  let n = 0;
  const seen = new Set<string>();
  const walk = (x: string) => {
    if (seen.has(x)) return;
    seen.add(x);
    n += realBy.get(x) ?? 0;
    for (const k of kids.get(x) ?? []) walk(k);
  };
  walk(id);
  return n;
}

export function demoShowsIn(rule: DemoRule, cats: readonly DemoCategory[], realBy: ReadonlyMap<string, number>, categoryId: string | null): boolean {
  if (!rule.on || !categoryId) return false;
  const byId = new Map(cats.map((c) => [c.id, c]));
  if (!byId.has(categoryId)) return false;
  if (ancestorsOf(categoryId, byId).some((a) => rule.off.includes(a))) return false;
  if (rule.auto && realInBranch(categoryId, cats, realBy) >= rule.autoN) return false;
  return true;
}
