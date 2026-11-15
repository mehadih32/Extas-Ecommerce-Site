// PR 747 — the badge on a product card (the words in the corner of the photo) from the owner's `card.tagBadges`:
//   • nothing set (the shipped state): the product's first live tag, in its own name, as it always was;
//   • `order`: the tags the owner placed come first, in his order; the other tags follow in their own order;
//   • `hidden`: a tag that never shows as a badge;
//   • `labels`: the words shown instead of the tag's own name, English and Bengali.
// Pure: the card reads the setting once per list, then asks per product.
import type { TagBadgesSetting } from '@extas/settings';

export interface BadgeTag {
  slug: string;
  name: string;
}
export interface BadgeWords {
  en: string;
  bn: string;
}

export function pickBadge(tags: readonly BadgeTag[], cfg: TagBadgesSetting | null | undefined): BadgeWords | null {
  const live = tags.filter((t) => !cfg?.hidden.includes(t.slug));
  if (!live.length) return null;
  const rank = (slug: string) => {
    const i = cfg?.order.indexOf(slug) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  // a stable sort: tags the owner did not place keep their own order, after the placed ones
  const first = [...live].sort((a, b) => rank(a.slug) - rank(b.slug))[0]!;
  const own = cfg?.labels[first.slug];
  return own ? { en: own.en, bn: own.bn } : { en: first.name, bn: first.name };
}
