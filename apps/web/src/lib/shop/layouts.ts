// S02 · PR 76 — the page builder's one model, used by the shop pages and by Website › Page layouts. A page is a list of
// sections, each with "show" and its screens (`both`, `phone`, `desktop`), in the owner's order. Today's pages:
// - home: `home.sections` (PR 41, HOME_SECTIONS); a section missing from the saved list stays hidden, as before;
// - category: `layout.category` (registry-layouts.ts); the heading and the product listing are always shown;
// - PR 77 · product: `layout.product`, the sections under the first screen (it stays fixed: the phone gate's budget);
// - PR 77 · bag: `layout.bag`, the left column beside the summary; the bag's lines are always shown.
// Pure functions only: no database, no settings reads.
import { BAG_LOCKED, BAG_SECTIONS, CATEGORY_LOCKED, CATEGORY_SECTIONS, HOME_SECTIONS, PRODUCT_LOCKED, PRODUCT_SECTIONS, registry, type LayoutDevice } from '@extas/settings';
import type { LayoutRow } from './layout-rows';

export { moveRow, type LayoutRow } from './layout-rows';

export interface PageLayoutDef {
  /** The setting that keeps the list. */
  key: 'home.sections' | 'layout.category' | 'layout.product' | 'layout.bag';
  /** Every section the page knows, in the shop's own order. */
  ids: readonly string[];
  /** Sections that always show (they still move and choose their screens). */
  locked: readonly string[];
}

export const PAGE_LAYOUTS = {
  home: { key: 'home.sections', ids: HOME_SECTIONS, locked: [] },
  category: { key: 'layout.category', ids: CATEGORY_SECTIONS, locked: CATEGORY_LOCKED },
  product: { key: 'layout.product', ids: PRODUCT_SECTIONS, locked: PRODUCT_LOCKED },
  bag: { key: 'layout.bag', ids: BAG_SECTIONS, locked: BAG_LOCKED },
} as const satisfies Record<string, PageLayoutDef>;

export type LayoutPage = keyof typeof PAGE_LAYOUTS;
export const LAYOUT_PAGES = Object.keys(PAGE_LAYOUTS) as LayoutPage[];

export const isLayoutPage = (v: unknown): v is LayoutPage => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PAGE_LAYOUTS, v);

/**
 * The page's full list: the saved sections the page knows, once each, in the saved order; then every section the save
 * does not name, in the shop's order, hidden (shown when locked). Locked sections are always shown.
 */
export function fullLayout(page: LayoutPage, saved: readonly LayoutRow[] | null | undefined): LayoutRow[] {
  const def: PageLayoutDef = PAGE_LAYOUTS[page];
  const seen = new Set<string>();
  const rows: LayoutRow[] = [];
  for (const r of saved ?? []) {
    if (!def.ids.includes(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push({ id: r.id, on: r.on || def.locked.includes(r.id), ...(r.dev && r.dev !== 'both' ? { dev: r.dev } : {}) });
  }
  for (const id of def.ids) if (!seen.has(id)) rows.push({ id, on: def.locked.includes(id) });
  return rows;
}

/** The page's default list (the setting's own default). */
export function defaultLayout(page: LayoutPage): LayoutRow[] {
  return fullLayout(page, registry[PAGE_LAYOUTS[page].key].default as LayoutRow[]);
}

/** What the page draws, in order: the shown sections with their screens. */
export function shownSections<T extends string>(page: LayoutPage, saved: readonly LayoutRow[] | null | undefined): { id: T; dev: LayoutDevice }[] {
  return fullLayout(page, saved)
    .filter((r) => r.on)
    .map((r) => ({ id: r.id as T, dev: r.dev ?? 'both' }));
}

/** The class that keeps a section to its screens (shop-app.css), or null for both. */
export function deviceClass(dev: LayoutDevice): string | null {
  return dev === 'phone' ? 'ly-phone' : dev === 'desktop' ? 'ly-desk' : null;
}
