// PR 794 — the phone's bottom bar as prototype v5 draws it (core.js `bottombar`): five fixed places (Home, Orders, Products,
// Support, Reports) and a "Menu" button that opens every other section. A section the person may not open is left out of the
// five (never a dead link); the Menu button is always there, so every section stays reachable.
export const QUICK_SECTION_IDS = ['dashboard', 'orders', 'products', 'support', 'reports'] as const;

/** The sections that go in the bar's five places, in the prototype's order, only those in `visible`. */
export function quickSections<T extends { id: string }>(visible: readonly T[]): T[] {
  return QUICK_SECTION_IDS.flatMap((id) => visible.filter((s) => s.id === id));
}
