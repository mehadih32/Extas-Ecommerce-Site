// S13 · PR 569 (register "Geography-led ad guidance") — the district's word, without the database. A district's settled
// orders are its delivered plus its returned ones (the Sales by area figure, PR 568); its return rate is returned ÷
// settled. Advice only: nothing here changes a budget, a campaign or a target.
import type { GeoGuideSettings } from '@extas/settings';

export const GEO_WORDS = ['more', 'hold', 'less', 'few'] as const;
export type GeoWord = (typeof GEO_WORDS)[number];

export interface DistrictFigures {
  delivered: number;
  returned: number;
}

/** The return rate in whole per cent, null with nothing settled. */
export function returnPct(f: DistrictFigures): number | null {
  const settled = f.delivered + f.returned;
  return settled ? Math.round((f.returned * 100) / settled) : null;
}

/**
 * The district's word: too few settled orders → `few`; a return rate from `badReturnPct` → `less`; up to
 * `goodReturnPct` with at least `minOrders` delivered → `more`; anything between → `hold`.
 */
export function wordOf(f: DistrictFigures, s: Pick<GeoGuideSettings, 'minOrders' | 'goodReturnPct' | 'badReturnPct'>): GeoWord {
  const pct = returnPct(f);
  if (pct === null || f.delivered + f.returned < s.minOrders) return 'few';
  if (pct >= s.badReturnPct) return 'less';
  if (pct <= s.goodReturnPct && f.delivered >= s.minOrders) return 'more';
  return 'hold';
}

/** The district names of one word, for an ad platform's location targeting (one comma-separated line). */
export const copyLine = (names: readonly string[]): string => names.join(', ');
