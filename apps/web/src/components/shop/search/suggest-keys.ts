// PR 72 follow-up (106) — the arrow keys through the live suggestions: ↓ and ↑ move a highlight over the suggestion
// links (help answers, categories, products, the computer's grid) while the typing stays in the box; the box names the
// highlighted one (`aria-activedescendant`), Enter opens it, Esc or any other key takes the highlight off (Enter then
// searches, as before). Tab still walks through them as it did. Plain DOM, shared by the phone window, the computer's
// panel and the results page's box.

/** What the keys touch on a suggestion link (a DOM element in the page; a stand-in in the tests). */
export interface SuggestItem {
  id: string;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  click(): void;
}

export interface SuggestBox {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export const ACTIVE = 'data-active';

/** The next highlighted place: -1 is the box itself (no highlight); ↓ from the last and ↑ from the first go back to it. */
export function stepActive(current: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : count - 1;
  const next = current + dir;
  return next < 0 || next >= count ? -1 : next;
}

/** The highlight off every item, and the box no longer names one. */
export function clearActive(box: SuggestBox, items: readonly SuggestItem[]): void {
  for (const it of items) it.removeAttribute(ACTIVE);
  box.removeAttribute('aria-activedescendant');
}

/**
 * One key in the box. Returns true when the key was the suggestions' own (the caller then stops the form's default:
 * the page must not scroll on an arrow, and Enter on a highlight opens it rather than searching).
 */
export function suggestKey(key: string, box: SuggestBox, items: readonly SuggestItem[], prefix: string): boolean {
  const current = items.findIndex((it) => it.hasAttribute(ACTIVE));
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (!items.length) return false;
    const next = stepActive(current, items.length, key === 'ArrowDown' ? 1 : -1);
    clearActive(box, items);
    if (next >= 0) {
      const it = items[next]!;
      if (!it.id) it.id = `${prefix}-${next}`;
      it.setAttribute(ACTIVE, '');
      box.setAttribute('aria-activedescendant', it.id);
    }
    return true;
  }
  if (key === 'Enter' && current >= 0) {
    items[current]!.click();
    return true;
  }
  if (current >= 0) clearActive(box, items);
  return false;
}

/** The suggestion links under a box, as the page shows them (hidden ones are not reachable by the arrows). */
export function suggestItems(root: ParentNode | null): HTMLAnchorElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((a) => a.getClientRects().length > 0);
}
