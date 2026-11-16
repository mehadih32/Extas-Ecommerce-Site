// S29 · PR 757 (CN-054) — the words of the courier and coverage lens (messages/admin-geo-lens.{en,bn}.json, root key `geoLens`).
import type { GeoCourierLensLabels } from '@/components/admin/reports/GeoCourierLens';
import type { AdminView } from '../admin-page';
import { t, type Dict } from '../i18n';
import bn from '../../../messages/admin-geo-lens.bn.json';
import en from '../../../messages/admin-geo-lens.en.json';

/** The view with the lens's words added (English by default, Bengali with the toggle). */
export function withGeoLens(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, geoLens: (b ? bn : en).geoLens as unknown as Dict } };
}

export function geoLensLabels(view: AdminView): GeoCourierLensLabels {
  const w = (k: string, vars?: Record<string, string | number>) => t(view.dict, `geoLens.${k}`, vars);
  return {
    title: w('title'),
    sub: w('sub'),
    place: w('place'),
    parcels: w('parcels'),
    success: w('success'),
    late: w('late'),
    best: w('best'),
    mostUsed: w('mostUsed'),
    noRate: w('noRate'),
    noBest: w('noBest'),
    none: w('none'),
    gapsTitle: w('gapsTitle'),
    gapsSub: w('gapsSub'),
    gapsNone: w('gapsNone'),
    orders: w('orders'),
    unknownOrders: (n) => w('unknownOrders', { n }),
    flags: {
      tooFewParcels: w('flag.tooFewParcels'),
      lowSuccess: w('flag.lowSuccess'),
      late: w('flag.late'),
      coverageGap: w('flag.coverageGap'),
      betterCourier: w('flag.betterCourier'),
    },
  };
}
