// S02 · PR 76 — the page builder's row and its move, with no imports, so the admin's editor (a client component) does
// not pull the settings registry into the browser. lib/shop/layouts.ts builds on it.
import type { LayoutDevice } from '@extas/settings';

export interface LayoutRow {
  id: string;
  on: boolean;
  dev?: LayoutDevice;
}

/** Moves the row at `from` to `to` (drag and drop, ↑ ↓); out-of-range moves change nothing. */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return [...rows];
  const next = [...rows];
  const [r] = next.splice(from, 1);
  next.splice(to, 0, r!);
  return next;
}
