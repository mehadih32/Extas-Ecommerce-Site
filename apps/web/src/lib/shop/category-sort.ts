// PR 47 — the category page's sorts (demo 21-category.js CAT_SORTS, cat_sortOpts, cat_apply): the owner's choice of
// sorts in his order (`category.sort`), each with the dictionary's words or his own. "Recommended" is his own order of
// the products; a style without a price never jumps to the top of a price sort. Pure: no React, no DB.
import type { CategorySort, CategorySortSettings, ShopLabel } from '@extas/settings';
import type { CatItem } from './category-model';

/** The sorts offered, in the owner's order, each with its words (his own, or the dictionary's `cat.sort.<id>`). */
export function sortOptions(s: CategorySortSettings): Array<{ id: CategorySort; label: ShopLabel }> {
  return s.options.map((id) => ({ id, label: s.labels[id] ?? { key: `cat.sort.${id}` } }));
}

const byPrice = (dir: 1 | -1) => (a: CatItem, b: CatItem) => {
  if (a.price == null || b.price == null) return a.price == null ? (b.price == null ? 0 : 1) : -1;
  return (a.price - b.price) * dir;
};

/** The list in a sort's order; the list's own order (the owner's) breaks every tie, so a sort never shuffles. */
export function sortItems<T extends CatItem>(list: readonly T[], sort: CategorySort): T[] {
  const at = new Map(list.map((p, i) => [p.id, i]));
  const tie = (a: T, b: T) => at.get(a.id)! - at.get(b.id)!;
  const cmp: ((a: T, b: T) => number) | null =
    sort === 'low'
      ? byPrice(1)
      : sort === 'high'
        ? byPrice(-1)
        : sort === 'new'
          ? (a, b) => b.published - a.published
          : sort === 'top'
            ? (a, b) => (b.reviews ? b.rating : -1) - (a.reviews ? a.rating : -1) || b.reviews - a.reviews
            : null;
  return cmp ? [...list].sort((a, b) => cmp(a, b) || tie(a, b)) : [...list];
}
