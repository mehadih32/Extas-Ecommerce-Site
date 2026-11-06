// S02 · PR 595 — the page layout builder's one list: a page's own sections (LayoutRow) and the owner's sections (blocks)
// in one order. A block keeps its place as "above that own section" (`before`, or null = the end), so the page's own
// order and the owner's sections live in their own settings (`home.sections` / `layout.category`, `layout.blocks`) and
// still read as one list. No imports beyond types: the admin's editor (a client component) uses it too.
import type { LayoutRow } from './layout-rows';

export type FlatItem<B> = { kind: 'sec'; row: LayoutRow } | { kind: 'block'; block: B };

/** The page's own sections in their order, each with the blocks above it; blocks with no (known) place at the end. */
export function flatten<B extends { before: string | null }>(rows: readonly LayoutRow[], blocks: readonly B[]): FlatItem<B>[] {
  const ids = new Set(rows.map((r) => r.id));
  const out: FlatItem<B>[] = [];
  for (const row of rows) {
    for (const block of blocks) if (block.before === row.id) out.push({ kind: 'block', block });
    out.push({ kind: 'sec', row });
  }
  for (const block of blocks) if (block.before === null || !ids.has(block.before)) out.push({ kind: 'block', block });
  return out;
}

/** Back to the two lists: each block's place becomes the own section right under it (null when none is). */
export function unflatten<B extends { before: string | null }>(items: readonly FlatItem<B>[]): { rows: LayoutRow[]; blocks: B[] } {
  const rows: LayoutRow[] = [];
  const blocks: B[] = [];
  items.forEach((it, i) => {
    if (it.kind === 'sec') {
      rows.push(it.row);
      return;
    }
    const next = items.slice(i + 1).find((x): x is { kind: 'sec'; row: LayoutRow } => x.kind === 'sec');
    blocks.push({ ...it.block, before: next ? next.row.id : null });
  });
  return { rows, blocks };
}

/** Whether a block shows on a day (YYYY-MM-DD in the store's time zone): its switch, then its whole days. */
export function blockLive(b: { on: boolean; from: string | null; to: string | null }, today: string): boolean {
  return b.on && (!b.from || b.from <= today) && (!b.to || today <= b.to);
}

/** A block's state for the list: hidden, waiting for its first day, showing, or past its last day. */
export function blockState(b: { on: boolean; from: string | null; to: string | null }, today: string): 'off' | 'soon' | 'live' | 'ended' {
  if (!b.on) return 'off';
  if (b.from && today < b.from) return 'soon';
  if (b.to && b.to < today) return 'ended';
  return 'live';
}
