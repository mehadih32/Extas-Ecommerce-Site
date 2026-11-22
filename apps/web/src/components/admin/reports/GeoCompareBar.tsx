// S29 · PR 754 (CN-054) — Reports › Geography map: the Compare control under the period bar — Off, Previous period, Same
// period last year, or two days of your own. It only links (the choice lives in the address, so a view can be shared
// and the browser's Back works); the figures are `geoByArea`'s, which fills the earlier column when compare is on.
import Link from "next/link";
import type { GeoCompare, GeoDays } from "@extas/metrics";
import { compareParams, compareRange } from "@/lib/geo-map/compare";
import "./geo-panel.css";

export interface GeoCompareLabels {
  label: string;
  off: string;
  previous: string;
  lastYear: string;
  custom: string;
  from: string;
  to: string;
  apply: string;
  /** "Compared with {from} to {to}" */
  comparedWith: (from: string, to: string) => string;
}

const MODES: readonly GeoCompare[] = ["off", "previous", "lastYear", "custom"];

export function GeoCompareBar({
  mode,
  days,
  custom,
  range,
  base,
  path,
  labels,
}: {
  mode: GeoCompare;
  /** The days the map covers (the starting point of a custom choice). */
  days: GeoDays;
  custom: GeoDays | null;
  /** The days the earlier column covers; null while compare is off. */
  range: GeoDays | null;
  /** The rest of the screen's address (period, level, slices …), kept when the choice changes. */
  base: Record<string, string>;
  /** The screen's path, e.g. /admin/reports/geo-map */
  path: string;
  labels: GeoCompareLabels;
}) {
  const hrefFor = (m: GeoCompare) => {
    // "Own days" starts from the previous period's days, so the two day boxes open filled in and valid
    const own = m === "custom" ? (custom ?? compareRange(days, "previous")) : null;
    const sp = new URLSearchParams({ ...base, ...compareParams(m, own) });
    return `${path}?${sp.toString()}`;
  };
  return (
    <div className="gcb" role="group" aria-label={labels.label} data-testid="geo-compare">
      <span className="gcb-k">{labels.label}</span>
      <div className="gcb-modes">
        {MODES.map((m) => (
          <Link
            key={m}
            href={hrefFor(m)}
            className={`gcb-m${m === mode ? " on" : ""}`}
            aria-current={m === mode ? "true" : undefined}
            scroll={false}
            data-mode={m}
          >
            {labels[m]}
          </Link>
        ))}
      </div>
      {mode === "custom" ? (
        <form className="gcb-form" method="get" action={path} data-testid="geo-compare-custom">
          {Object.entries(base).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name="compare" value="custom" />
          <label>
            <span>{labels.from}</span>
            <input type="date" name="cfrom" defaultValue={custom?.from ?? ""} required />
          </label>
          <label>
            <span>{labels.to}</span>
            <input type="date" name="cto" defaultValue={custom?.to ?? ""} required />
          </label>
          <button type="submit" className="a2-btn sm">
            {labels.apply}
          </button>
        </form>
      ) : null}
      {range ? (
        <span className="gcb-r" data-testid="geo-compare-range">
          {labels.comparedWith(range.from, range.to)}
        </span>
      ) : null}
    </div>
  );
}
