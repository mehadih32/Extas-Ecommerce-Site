// S28 · PR 705 — the pure side of the People and Roles screens (no database, no server imports): the permission tree the
// role builder draws, and its tri-state boxes (all of a group, some of it, none). The screen and the tests both read this.

export interface CataloguePermission {
  key: string;
  group: string;
  label: { en: string; bn: string };
  groupLabel: { en: string; bn: string };
}

export interface TreeBranch {
  group: string;
  label: { en: string; bn: string };
  keys: { key: string; label: { en: string; bn: string } }[];
}

export type Tri = 'all' | 'some' | 'none';

/** The catalogue as a tree: every permission once under its group, groups in the order the catalogue first names them. */
export function buildTree(catalogue: readonly CataloguePermission[]): TreeBranch[] {
  const by = new Map<string, TreeBranch>();
  for (const p of catalogue) {
    let b = by.get(p.group);
    if (!b) {
      b = { group: p.group, label: p.groupLabel, keys: [] };
      by.set(p.group, b);
    }
    b.keys.push({ key: p.key, label: p.label });
  }
  return [...by.values()];
}

/** A group's box: ticked when every key is held, half when only some are, empty when none. */
export function triOf(keys: readonly string[], held: ReadonlySet<string>): Tri {
  const n = keys.filter((k) => held.has(k)).length;
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'some';
}

/** Ticking a group gives all its keys; a half or full box unticked takes them all away. */
export function toggleGroup(held: ReadonlySet<string>, keys: readonly string[], on: boolean): Set<string> {
  const next = new Set(held);
  for (const k of keys) {
    if (on) next.add(k);
    else next.delete(k);
  }
  return next;
}

/** The keys that differ between two sets (what a save would change), for the "n changes" line. */
export function diffKeys(before: ReadonlySet<string>, after: ReadonlySet<string>): { added: string[]; removed: string[] } {
  return { added: [...after].filter((k) => !before.has(k)).sort(), removed: [...before].filter((k) => !after.has(k)).sort() };
}

/** What the screen may show of one activity-log row's change: the names of the fields, never their old or new values. */
export function changedKeys(before: unknown, after: unknown): string[] {
  const keys = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as Record<string, unknown>) : []);
  return [...new Set([...keys(before), ...keys(after)])].sort().slice(0, 12); // hardcode-ok: how many field names one row lists
}
