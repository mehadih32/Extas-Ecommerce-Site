// S29 · PR 756 (CN-054) — Reports › Geography map: "Orders by …" — the orders of the period cut by ONE of the order-level
// slices (channel, payment, courier, customer type), every value that has orders, the parts adding up to the Total line
// and an order that does not say counted as "Not known" (never dropped). The numbers are `geoSliceBreakdown`'s. The
// dimension tabs are links, so the choice lives in the address.
import Link from "next/link";
import { SLICE_DIMENSIONS, UNKNOWN_BUCKET, type SliceBreakdown, type SliceDimension } from "@extas/metrics";
import "./geo-slices.css";

export interface GeoSliceTableLabels {
  title: (dimension: string) => string;
  sub: string;
  dimension: string;
  dimensions: Record<SliceDimension, string>;
  name: string;
  orders: string;
  delivered: string;
  returned: string;
  sales: string;
  total: string;
  none: string;
  unknown: string;
}

export function GeoSliceTable({
  data,
  labels,
  valueName,
  hrefFor,
  fmt,
}: {
  data: SliceBreakdown;
  labels: GeoSliceTableLabels;
  /** The words for one bucket of the dimension (PHONE → "Phone", a courier id → its name); null: show the key. */
  valueName: (dimension: SliceDimension, key: string) => string | null;
  /** The address that shows another dimension. */
  hrefFor: (dimension: SliceDimension) => string;
  fmt: { number: (n: number) => string; money: (minor: number) => string };
}) {
  const money = data.total.salesMinor !== null;
  return (
    <section className="gst" data-testid="geo-slice-table" data-dimension={data.dimension}>
      <h3 className="a2-h3">{labels.title(labels.dimensions[data.dimension])}</h3>
      <p className="a2-xs a2-mute">{labels.sub}</p>
      <nav className="gst-tabs" aria-label={labels.dimension}>
        {SLICE_DIMENSIONS.map((d) => (
          <Link key={d} href={hrefFor(d)} className={`gst-tab${d === data.dimension ? " on" : ""}`} aria-current={d === data.dimension ? "true" : undefined} scroll={false} data-dimension={d}>
            {labels.dimensions[d]}
          </Link>
        ))}
      </nav>
      {data.buckets.length === 0 ? (
        <p className="a2-xs a2-mute" data-testid="geo-slice-none">
          {labels.none}
        </p>
      ) : (
        <div className="gst-wrap">
          <table className="gst-table">
            <thead>
              <tr>
                <th scope="col">{labels.name}</th>
                <th scope="col" className="gst-n">{labels.orders}</th>
                <th scope="col" className="gst-n">{labels.delivered}</th>
                <th scope="col" className="gst-n">{labels.returned}</th>
                {money ? <th scope="col" className="gst-n">{labels.sales}</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((b) => (
                <tr key={b.key} data-bucket={b.key}>
                  <th scope="row" className={b.key === UNKNOWN_BUCKET ? "gst-unk" : undefined}>
                    {b.key === UNKNOWN_BUCKET ? labels.unknown : (valueName(data.dimension, b.key) ?? b.key)}
                  </th>
                  <td className="gst-n">{fmt.number(b.orders)}</td>
                  <td className="gst-n">{fmt.number(b.delivered)}</td>
                  <td className="gst-n">{fmt.number(b.returned)}</td>
                  {money ? <td className="gst-n">{b.salesMinor === null ? "—" : fmt.money(b.salesMinor)}</td> : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr data-testid="geo-slice-total">
                <th scope="row">{labels.total}</th>
                <td className="gst-n">{fmt.number(data.total.orders)}</td>
                <td className="gst-n">{fmt.number(data.total.delivered)}</td>
                <td className="gst-n">{fmt.number(data.total.returned)}</td>
                {money ? <td className="gst-n">{data.total.salesMinor === null ? "—" : fmt.money(data.total.salesMinor)}</td> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
