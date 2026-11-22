// S29 · PR 754 (CN-054) — the words of the Geography map's click panel, loaded into a view the way the other report pages
// load their own file (messages/admin-geo-panel.{en,bn}.json, root key `geoPanel`), and turned into the `labels` the
// panel component takes. Nothing here is a number of the shop: every figure comes from the figures and the settings.
import type { GeoLevel } from "@extas/metrics";
import type { GeoCompareLabels } from "@/components/admin/reports/GeoCompareBar";
import type { GeoPanelLabels } from "@/components/admin/reports/GeoPanel";
import type { AdminView } from "../admin-page";

/** What the labels need of a view: the dictionary only (so a client screen can build them from the dictionaries it was given). */
export type WordsView = Pick<AdminView, "dict">;
import { t, type Dict } from "../i18n";
import bn from "../../../messages/admin-geo-panel.bn.json";
import en from "../../../messages/admin-geo-panel.en.json";

/** The view with the panel's words added (English by default, Bengali with the toggle). */
export function withGeoPanel(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, geoPanel: (b ? bn : en).geoPanel as unknown as Dict } };
}

const FIGURES = ['orders', 'sales', 'delivered', 'returned', 'returnRate'] as const;
const LEVELS: readonly GeoLevel[] = ['division', 'district', 'upazila', 'area'];

/** The panel's labels in the view's language. The view must carry `geoPanel` (see `withGeoPanel`). */
export function geoPanelLabels(view: WordsView): GeoPanelLabels {
  const d = view.dict;
  const one = (k: string, vars?: Record<string, string | number>) => t(d, `geoPanel.${k}`, vars);
  return {
    aria: one('aria'),
    close: one('close'),
    now: one('now'),
    before: one('before'),
    change: one('change'),
    pts: one('pts'),
    topCategory: one('topCategory'),
    noCategory: one('noCategory'),
    noProducts: one('noProducts'),
    loading: one('loading'),
    failed: one('failed'),
    retry: one('retry'),
    moneyHidden: one('moneyHidden'),
    openOrders: one('openOrders'),
    openOrdersHint: one('openOrdersHint'),
    counted: one('counted'),
    up: one('up'),
    down: one('down'),
    same: one('same'),
    fig: Object.fromEntries(FIGURES.map((k) => [k, one(`fig.${k}`)])),
    level: Object.fromEntries(LEVELS.map((k) => [k, one(`level.${k}`)])) as Record<GeoLevel, string>,
    comparedWith: (from, to) => one('comparedWith', { from, to }),
    pcs: (n) => one('pcs', { n }),
    topProducts: (n) => one('topProducts', { n }),
    tooFew: (n) => one('tooFew', { n }),
    returnWarn: (n) => one('returnWarn', { n }),
    deeper: (level) => one('deeper', { level }),
  };
}

/** The compare control's labels in the view's language. */
export function geoCompareLabels(view: WordsView): GeoCompareLabels {
  const c = (k: string) => t(view.dict, `geoPanel.compare.${k}`);
  return {
    label: c('label'),
    off: c('off'),
    previous: c('previous'),
    lastYear: c('lastYear'),
    custom: c('custom'),
    from: c('from'),
    to: c('to'),
    apply: c('apply'),
    comparedWith: (from, to) => t(view.dict, 'geoPanel.comparedWith', { from, to }),
  };
}
