// S29 · PR 757 (CN-054) — Reports › Geography map, the courier and coverage lens: the places of the level with their
// courier success, late share and best courier (advice only, from the shop's own parcels), flagged places first, and the
// list of places with orders and no courier mapped. Every number is `courierLens`'s; nothing here changes a courier rule.
import type { CourierLensResponse } from "@extas/metrics";
import "./geo-slices.css";
import "./geo-lens.css";

export interface GeoCourierLensLabels {
  title: string;
  sub: string;
  place: string;
  parcels: string;
  success: string;
  late: string;
  best: string;
  mostUsed: string;
  noRate: string;
  noBest: string;
  none: string;
  gapsTitle: string;
  gapsSub: string;
  gapsNone: string;
  orders: string;
  unknownOrders: (n: string) => string;
  flags: { tooFewParcels: string; lowSuccess: string; late: string; coverageGap: string; betterCourier: string };
}

export function GeoCourierLens({
  data,
  labels,
  nameOf,
  fmt,
}: {
  data: CourierLensResponse;
  labels: GeoCourierLensLabels;
  /** The place's name in the shown language. */
  nameOf: (areaId: string) => string;
  fmt: { number: (n: number) => string; pct: (ratio: number) => string };
}) {
  const courier = new Map(data.couriers.map((c) => [c.id, c.name]));
  const flagged = (r: { flags: string[] }) => r.flags.length;
  const rows = data.rows
    .filter((r) => (r.figures.parcels ?? 0) > 0 || r.flags.length > 0)
    .sort((a, b) => flagged(b) - flagged(a) || (b.figures.parcels ?? 0) - (a.figures.parcels ?? 0));
  const word = (f: string) => (labels.flags as Record<string, string>)[f] ?? f;
  return (
    <section className="gst" data-testid="geo-courier-lens">
      <h3 className="a2-h3">{labels.title}</h3>
      <p className="a2-xs a2-mute">{labels.sub}</p>
      {rows.length === 0 ? (
        <p className="a2-xs a2-mute" data-testid="geo-lens-none">
          {labels.none}
        </p>
      ) : (
        <div className="gst-wrap">
          <table className="gst-table">
            <thead>
              <tr>
                <th scope="col">{labels.place}</th>
                <th scope="col">{labels.parcels}</th>
                <th scope="col">{labels.success}</th>
                <th scope="col">{labels.late}</th>
                <th scope="col">{labels.best}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = data.details[r.areaId];
                const rate = r.figures.courierSuccessRate;
                const lateShare = r.figures.lateShare;
                return (
                  <tr key={r.areaId} data-area={r.areaId} data-flagged={r.flags.length > 0 ? "true" : undefined}>
                    <th scope="row">
                      {nameOf(r.areaId)}
                      {r.flags.map((f) => (
                        <span key={f} className="gst-flag" data-flag={f}>
                          {word(f)}
                        </span>
                      ))}
                    </th>
                    <td>{fmt.number(r.figures.parcels ?? 0)}</td>
                    <td>{rate === null || rate === undefined ? labels.noRate : fmt.pct(rate)}</td>
                    <td>{lateShare === null || lateShare === undefined ? labels.noRate : fmt.pct(lateShare)}</td>
                    <td>
                      {d?.best ? `${courier.get(d.best.courierId) ?? d.best.courierId} · ${fmt.pct(d.best.successRate)}` : d?.mostUsedCourierId ? `${labels.mostUsed}: ${courier.get(d.mostUsedCourierId) ?? d.mostUsedCourierId}` : labels.noBest}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <h4 className="a2-h4">{labels.gapsTitle}</h4>
      <p className="a2-xs a2-mute">{labels.gapsSub}</p>
      {data.gaps.length === 0 ? (
        <p className="a2-xs a2-mute" data-testid="geo-gaps-none">
          {labels.gapsNone}
        </p>
      ) : (
        <ul className="gst-gaps" data-testid="geo-gaps">
          {data.gaps.map((g) => (
            <li key={g.areaId} data-area={g.areaId}>
              {nameOf(g.areaId)} <span className="a2-mute">{fmt.number(g.orders)} {labels.orders}</span>
            </li>
          ))}
        </ul>
      )}
      {data.unknownOrders > 0 ? <p className="a2-xs a2-mute">{labels.unknownOrders(fmt.number(data.unknownOrders))}</p> : null}
    </section>
  );
}
