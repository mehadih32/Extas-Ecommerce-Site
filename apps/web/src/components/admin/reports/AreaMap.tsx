// S16 · PR 568 — the map on Reports → Sales by area: each area with a map point (GeoArea lat/lng, PR 549–552) as a circle
// placed by its latitude and longitude — the bigger, the more Sales; the redder, the higher its return rate (the reddest
// is the highest on the map). No map tiles and no outside service: the frame is fitted to the points themselves. Areas
// without a point stay in the table only.
import type { AreaRow } from '@extas/metrics';

/** The drawing's width in its own units (it scales to the card). */
const W = 640;
/** The biggest and smallest circle radius, in the drawing's units. */
const R_MAX = 34;
const R_MIN = 5;
/** Room around the outermost points, as a share of the span. */
const PAD = 0.12;

export function AreaMap({ rows, none, label }: { rows: AreaRow[]; none: string; label: (row: AreaRow) => string }) {
  const pts = rows.filter((r) => r.lat !== null && r.lng !== null && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  if (!pts.length)
    return (
      <p className="a2-xs a2-mute" data-testid="ar-map-none">
        {none}
      </p>
    );
  const lats = pts.map((p) => p.lat!);
  const lngs = pts.map((p) => p.lng!);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  // a degree of longitude is shorter away from the equator
  const kx = Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((Math.max(...lngs) - Math.min(...lngs)) * kx, 0.05);
  const spanY = Math.max(Math.max(...lats) - Math.min(...lats), 0.05);
  const x0 = Math.min(...lngs) * kx - spanX * PAD;
  const y1 = Math.max(...lats) + spanY * PAD;
  const sx = W / (spanX * (1 + 2 * PAD));
  const H = Math.round(Math.min(W * 1.4, Math.max(W * 0.5, spanY * (1 + 2 * PAD) * sx)));
  const sy = H / (spanY * (1 + 2 * PAD));
  const top = Math.max(...pts.map((p) => p.salesMinor), 1);
  // the reddest circle is the area with the highest return rate on this map
  const worst = Math.max(...pts.map((p) => p.returnRate ?? 0));
  // smaller circles drawn last, so a big one never hides a small one
  const order = [...pts].sort((a, b) => b.salesMinor - a.salesMinor);
  return (
    <svg className="ar-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={order.map(label).join('; ')} data-testid="ar-map-svg">
      {order.map((p) => {
        const r = R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.max(0, p.salesMinor) / top);
        const red = p.returnRate === null || worst === 0 ? 0 : Math.round((100 * p.returnRate) / worst);
        return (
          <circle
            key={p.areaId}
            cx={(p.lng! * kx - x0) * sx}
            cy={(y1 - p.lat!) * sy}
            r={r}
            className="ar-dot"
            style={{ fill: `color-mix(in srgb, var(--bad) ${red}%, var(--ok))` }}
            data-testid="ar-dot"
          >
            <title>{label(p)}</title>
          </circle>
        );
      })}
    </svg>
  );
}
