// PR 829 (prototype v5, Products › Combos): the figures above the combo lists, from the combo list and the combo report.
// Pure: no database. "On the shop" counts the combos on sale now plus the live colour-pair rules; "waiting" counts the
// combos switched on whose start day has not come (soon). The average saving is over the on-sale combos that have an offer
// (a whole percentage, rounded down as the cards show it). The best seller is the report's first row with a set sold.
export interface SummaryCombo {
  state: string;
  pricing: { offer: boolean; savingPercent: number };
}
export interface SummaryReport {
  totals: { setsOrdered: number; salesMinor: number };
  top: { nameEn: string; nameBn: string | null; setsOrdered: number }[];
}

export interface ComboFigures {
  onShop: number;
  waiting: number;
  sold: number;
  salesMinor: number;
  avgSavingPercent: number;
  best: { nameEn: string; nameBn: string | null; sets: number } | null;
}

export function summaryOf(combos: readonly SummaryCombo[], report: SummaryReport, liveRules: number): ComboFigures {
  const live = combos.filter((c) => c.state === 'live');
  const offers = live.filter((c) => c.pricing.offer);
  const top = report.top.find((r) => r.setsOrdered > 0);
  return {
    onShop: live.length + liveRules,
    waiting: combos.filter((c) => c.state === 'soon').length,
    sold: report.totals.setsOrdered,
    salesMinor: report.totals.salesMinor,
    avgSavingPercent: offers.length ? Math.floor(offers.reduce((n, c) => n + c.pricing.savingPercent, 0) / offers.length) : 0,
    best: top ? { nameEn: top.nameEn, nameBn: top.nameBn, sets: top.setsOrdered } : null,
  };
}
