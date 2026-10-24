// PR 12 (CN-025) — the "To do" drawer behind the top bar's tray (demo V12.4 97z-adm2-rd1-core.js A2.drawers.todo):
// the waiting lists of "Needs you now" grouped under plain headings, most urgent first, with "All", "Mine" and
// "Later". No React and no database: the server shell and the client drawer both read it.

/** The drawer's headings, in the drawer's order (demo V12.4: urgent first). */
export const TODO_GROUPS = ['urgent', 'orders', 'delivery', 'products', 'stock', 'money', 'messages', 'system'] as const;
export type TodoGroup = (typeof TODO_GROUPS)[number];

/** A list's heading: its own, else its section's when that is a heading, else "System". */
export function todoGroupOf(def: { group?: TodoGroup; section: string }): TodoGroup {
  if (def.group) return def.group;
  return (TODO_GROUPS as readonly string[]).includes(def.section) ? (def.section as TodoGroup) : 'system';
}

export interface TodoLike {
  id: string;
  group: TodoGroup;
}

/** Items under their headings in the drawer's order; empty headings are left out. */
export function groupTodo<T extends TodoLike>(items: readonly T[]): { group: TodoGroup; items: T[] }[] {
  return TODO_GROUPS.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter((g) => g.items.length > 0);
}

/** The list to start with: the first one that is not under "Urgent" (the urgent ones are shown in red above it). */
export function hotOf<T extends TodoLike>(groups: readonly { group: TodoGroup; items: T[] }[]): string | null {
  for (const g of groups) if (g.group !== 'urgent' && g.items.length) return g.items[0]!.id;
  return null;
}

/** "Later": the lists put aside until a time still to come (ms since 1970 per list id). */
export function splitLater<T extends TodoLike>(items: readonly T[], later: Record<string, number>, now: number): { open: T[]; later: T[] } {
  const aside = (i: T) => (later[i.id] ?? 0) > now;
  return { open: items.filter((i) => !aside(i)), later: items.filter(aside) };
}

/** Drops "Later" marks that have run out, so the stored list never grows. */
export function pruneLater(later: Record<string, number>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(later).filter(([, until]) => Number.isFinite(until) && until > now));
}
