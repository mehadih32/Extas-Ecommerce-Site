// S29 · PR 758–760 (CN-054) — Reports › Geography map: one table for the risk, the money and stock and the demand and customers
// lenses. It only draws what `lib/geo-map/lens-view.ts` and the lens routes worked out: the places with their figures (flagged
// places first), the total, the "No area" line, and a note when the viewer's role leaves a part out. A figure a role may not
// see is "—", never 0. Nothing here changes an order, a courier, a price, a charge, a budget or a stock.
import type { LensResult } from '@extas/metrics';
import { columnsShown, lensCell, type DrawnLens, type LensFormat } from '@/lib/geo-map/lens-view';
import "./geo-slices.css";
import "./geo-lens.css";

export interface GeoLensTableLabels {
  title: string;
  sub: string;
  place: string;
  total: string;
  unknown: string;
  outside: string;
  hidden: string;
  empty: string;
  col: Record<string, string>;
  flag: Record<string, string>;
}

export function GeoLensTable({
  lens,
  data,
  labels,
  fmt,
  nameOf,
}: {
  lens: DrawnLens;
  data: Pick<LensResult, "rows" | "total" | "unknown" | "outside" | "hidden">;
  labels: GeoLensTableLabels;
  fmt: LensFormat;
  /** A row's place in the shown language. */
  nameOf: (row: LensResult["rows"][number]) => string;
}) {
  const cols = columnsShown(lens, data);
  const rows = [...data.rows].sort((a, b) => b.flags.length - a.flags.length);
  const word = (f: string) => labels.flag[f] ?? f;
  const extra = (title: string, f: Record<string, number | null>) =>
    cols.some((c) => (f[c.key] ?? 0) > 0) ? (
      <tr className="gst-extra">
        <th scope="row">{title}</th>
        {cols.map((c) => (
          <td key={c.key}>{lensCell(c.kind, f[c.key], fmt)}</td>
        ))}
      </tr>
    ) : null;
  return (
    <section className="gst" data-testid={`geo-lens-${lens}`}>
      <h3 className="a2-h3">{labels.title}</h3>
      <p className="a2-xs a2-mute">{labels.sub}</p>
      {data.hidden.length ? (
        <p className="a2-xs a2-mute" data-testid="geo-lens-hidden">
          {labels.hidden}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="a2-xs a2-mute" data-testid="geo-lens-none">
          {labels.empty}
        </p>
      ) : (
        <div className="gst-wrap">
          <table className="gst-table">
            <thead>
              <tr>
                <th scope="col">{labels.place}</th>
                {cols.map((c) => (
                  <th key={c.key} scope="col">
                    {labels.col[c.key] ?? c.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.areaId} data-area={r.areaId} data-flagged={r.flags.length > 0 ? "true" : undefined}>
                  <th scope="row">
                    {nameOf(r)}
                    {r.flags.map((f) => (
                      <span key={f} className="gst-flag" data-flag={f}>
                        {word(f)}
                      </span>
                    ))}
                  </th>
                  {cols.map((c) => (
                    <td key={c.key}>{lensCell(c.kind, r.figures[c.key], fmt)}</td>
                  ))}
                </tr>
              ))}
              {extra(labels.unknown, data.unknown)}
              {extra(labels.outside, data.outside)}
              <tr className="gst-total">
                <th scope="row">{labels.total}</th>
                {cols.map((c) => (
                  <td key={c.key}>{lensCell(c.kind, data.total[c.key], fmt)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
