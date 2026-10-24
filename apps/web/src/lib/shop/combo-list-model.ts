// PR 572 — a rule's own page, the pure part (no server imports; unit-tested): what its link says (the colour chips,
// "My size", the order, "See all", one style, the 2 / 3 piece switch, a template preview), the links that change one
// of them, and the words of a pair card (demo 42-combo-auto.js ca_card, ca_sizeLine). The filters are links, so the
// page works and can be shared with every choice in it; the rules themselves are @extas/combos `filterPairs` & co.
import { LIST_SORTS, sizeLine, type ListPair, type ListSort } from '@extas/combos/rule-page-model';

export interface ListQuery {
  /** Colour keys every pair must have. */
  has: string[];
  /** A size key every piece must be open in. */
  size: string | null;
  sort: ListSort;
  /** "See all" was tapped. */
  all: boolean;
  /** One style of the rule (L2's style card). */
  style: string | null;
  /** L5: the 2- or 3-piece rule shown. */
  tier: 2 | 3 | null;
  /** A template preview (`combos.template.preview`). */
  tpl: string | null;
}

export type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
const KEY = /^[A-Za-z0-9_.~-]{1,80}$/;

export function parseListQuery(search: Search): ListQuery {
  const has = (one(search.has) ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => KEY.test(x));
  const sort = one(search.sort);
  const size = one(search.size);
  const style = one(search.style);
  const tier = one(search.tier);
  const tpl = one(search.tpl);
  return {
    has: [...new Set(has)].slice(0, 12),
    size: size && KEY.test(size) ? size : null,
    sort: (LIST_SORTS as readonly string[]).includes(sort ?? '') ? (sort as ListSort) : 'best',
    all: one(search.all) === '1',
    style: style && KEY.test(style) ? style : null,
    tier: tier === '2' ? 2 : tier === '3' ? 3 : null,
    tpl: tpl && /^[A-Z][0-9]$/.test(tpl) ? tpl : null,
  };
}

/** Anything in the link beyond the page itself (such a page is not indexed). */
export const isFiltered = (q: ListQuery) => q.has.length > 0 || q.size !== null || q.sort !== 'best' || q.all || q.style !== null || q.tier !== null || q.tpl !== null;

/** The page's link with these changes (empty values dropped; a changed filter starts the list from the top again). */
export function listHref(base: string, q: ListQuery, patch: Partial<ListQuery>): string {
  const n = { ...q, ...patch };
  const p = new URLSearchParams();
  if (n.tpl) p.set('tpl', n.tpl);
  if (n.style) p.set('style', n.style);
  if (n.tier) p.set('tier', String(n.tier));
  if (n.has.length) p.set('has', n.has.join(','));
  if (n.size) p.set('size', n.size);
  if (n.sort !== 'best') p.set('sort', n.sort);
  if (n.all) p.set('all', '1');
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** The link with one colour chip turned on or off ("See all" folds again). */
export const toggleHas = (base: string, q: ListQuery, key: string) => listHref(base, q, { has: q.has.includes(key) ? q.has.filter((k) => k !== key) : [...q.has, key], all: false });

type T = (key: string, vars?: Record<string, string | number>) => string;

/** A card's size words (demo ca_sizeLine), or the picked size's state when "My size" is on. */
export function cardSizeWords(t: T, pair: Pick<ListPair, 'sizes' | 'openSizes'>, size: string | null): { text: string; ok: boolean | null } {
  if (size) {
    const s = pair.sizes.find((x) => x.key === size);
    const label = s?.label ?? size;
    return s?.ok ? { text: t('ctpl.list.inSize', { size: label }), ok: true } : { text: t('ctpl.list.outSize', { size: label }), ok: false };
  }
  const l = sizeLine(pair.sizes, pair.openSizes);
  if (l.kind === 'soldOut') return { text: t('ctpl.list.soldOut'), ok: null };
  if (l.kind === 'each') return { text: t('ctpl.list.sizesEach'), ok: null };
  if (l.kind === 'all' || l.kind === 'range') return { text: t('ctpl.list.sizesAll', { from: l.from!, to: l.to! }), ok: null };
  const list = l.labels!.join(' · ');
  return { text: l.few ? t('ctpl.list.sizesLeft', { list }) : list, ok: null };
}

/** The colour names of a pair, "Black + Navy". */
export const pairTitle = (pair: Pick<ListPair, 'pieces'>, colourName: (id: string) => string) => pair.pieces.map((p) => colourName(p.colourId)).join(' + ');
