// S29 · PR 758–761 (CN-054) — the labels of the risk, money and stock, and demand and customers lens tables and of the AI
// advisor's box, from messages/admin-geo-lenses.{en,bn}.json (root key `geoLenses`).
import type { GeoAdvisorLabels } from "@/components/admin/reports/GeoAdvisor";
import type { GeoLensTableLabels } from "@/components/admin/reports/GeoLensTable";
import { DRAWN_LENSES, LENS_COLUMNS, type DrawnLens } from "./lens-view";
import { t, type Dict } from "../i18n";

const FLAGS = [
  "returnHotspot",
  "riskArea",
  "deliveryEatsProfit",
  "adsExceedSales",
  "repeatLeaning",
  "newLeaning",
  "demandGap",
] as const;

export function geoLensTableLabels(
  view: { dict: Dict },
  lens: DrawnLens,
): GeoLensTableLabels {
  const w = (k: string) => t(view.dict, `geoLenses.${k}`);
  const keys = [
    ...new Set(
      Object.values(LENS_COLUMNS).flatMap((cols) => cols.map((c) => c.key)),
    ),
  ];
  return {
    title: w(`title.${lens}`),
    sub: w(`sub.${lens}`),
    place: w("place"),
    total: w("total"),
    unknown: w("unknown"),
    outside: w("outside"),
    hidden: w("hidden"),
    empty: w("empty"),
    col: Object.fromEntries(keys.map((k) => [k, w(`col.${k}`)])),
    flag: Object.fromEntries(FLAGS.map((f) => [f, w(`flag.${f}`)])),
  };
}

export function geoAdvisorLabels(view: { dict: Dict }): GeoAdvisorLabels {
  const w = (k: string) => t(view.dict, `geoLenses.advisor.${k}`);
  return {
    title: w("title"),
    sub: w("sub"),
    run: w("run"),
    running: w("running"),
    off: w("off"),
    aiOff: w("aiOff"),
    needControl: w("needControl"),
    ready: w("ready"),
    result: t(view.dict, "geoLenses.advisor.result", {
      drafted: "{drafted}",
      waiting: "{waiting}",
      over: "{over}",
      nonote: "{nonote}",
    }),
    draftsTitle: w("draftsTitle"),
    noDrafts: w("noDrafts"),
    expires: t(view.dict, "geoLenses.advisor.expires", { date: "{date}" }),
    queue: w("queue"),
    failed: w("failed"),
  };
}

export { DRAWN_LENSES };
