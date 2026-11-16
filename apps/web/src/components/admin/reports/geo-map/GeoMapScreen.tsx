"use client";
// S29 · PR 753 — Reports › Geography map: the screen. A map of Bangladesh drawn from the boundary pack (PR 750) and coloured
// by one figure, with the period bar, the figure picker, the category and product filters, the drill-down (division →
// district → upazila → areas of Dhaka City) with a trail, the "Unknown area" line, a sortable table and the one-area panel.
// It reads the routes of PR 752 and only draws: no figure is worked out here, no number is typed here (the colour steps, the
// minimum orders and the warning rate come from the setting). Phone: the map over the list, big zoom buttons, a Map / List
// switch, the panel as a sheet from the bottom, text never under 14 px. Words come in as `c` (messages/admin-geo-map.*).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { project } from "@extas/delivery/geo-pack";
import type {
  GeoAreaDetail,
  GeoAreaRow,
  GeoByArea,
  GeoLevel,
  GeoMapApiResponse,
  GeoMapAreaApiResponse,
  GeoMapSetting,
  GeoMetric,
  GeoPack,
} from "@extas/metrics/geo-types";
import {
  childLevel,
  fillClass,
  fitBox,
  maxOf,
  metricValue,
  pctText,
  sortRows,
  zoomBox,
  type Crumb,
  type SortKey,
} from "@/lib/geo-map/model";
import "./geo-map.css";

export type GeoMapWords = Record<string, string>;

export interface GeoMapScreenProps {
  c: GeoMapWords;
  setting: GeoMapSetting;
  lang: "en" | "bn";
  locale: string;
  currency: string;
  /** The categories to filter by: id and the name in the screen's language. */
  categories: { id: string; name: string }[];
  /** Sales are only drawn for a person who may see money (the server hides them anyway). */
  moneyAllowed: boolean;
}

const PERIODS = ["day", "month", "sixMonths", "year"] as const;
const METRICS: Exclude<GeoMetric, "change">[] = ["orders", "sales", "delivered", "returned", "returnRate"];

type Loaded = { data: GeoByArea; moneyHidden: boolean } | { error: string };

export function GeoMapScreen(p: GeoMapScreenProps) {
  const { c, setting, lang } = p;
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(setting.defaultPeriod);
  const [metric, setMetric] = useState<GeoMetric>(setting.defaultMetric);
  const [compare, setCompare] = useState(setting.compareDefault);
  const [categoryId, setCategoryId] = useState("");
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [shown, setShown] = useState<"map" | "list">("map");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "orders", dir: "desc" });
  const [picked, setPicked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<GeoPack | null>(null);
  const [detail, setDetail] = useState<GeoAreaDetail | null>(null);
  const [detailBad, setDetailBad] = useState(false);
  const [view, setView] = useState<string | null>(null);

  const here = trail[trail.length - 1];
  const level: GeoLevel = here ? (childLevel(here.level) ?? here.level) : "division";
  const parentId = here?.areaId ?? null;
  const nameOf = useCallback((r: { nameEn: string; nameBn: string | null }) => (lang === "bn" && r.nameBn ? r.nameBn : r.nameEn), [lang]);

  // ---- the figures --------------------------------------------------------------------------------------------------
  const query = useMemo(() => {
    const u = new URLSearchParams({ period, level, compare: compare ? "previous" : "off" });
    if (parentId) u.set("parent", parentId);
    if (categoryId) u.set("category", categoryId);
    return u.toString();
  }, [period, level, compare, parentId, categoryId]);

  useEffect(() => {
    const ac = new AbortController();
    setBusy(true);
    fetch(`/api/admin/reports/geo-map?${query}`, { signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json()) as GeoMapApiResponse;
        setLoaded(j.ok ? { data: j.data, moneyHidden: j.moneyHidden } : { error: j.error });
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setLoaded({ error: "network" });
      })
      .finally(() => !ac.signal.aborted && setBusy(false));
    return () => ac.abort();
  }, [query]);

  // ---- the shapes (one level at a time, kept by the browser) ------------------------------------------------------------
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/admin/reports/geo-map/shapes?level=${level}`, { signal: ac.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as { ok: true; pack: GeoPack }).pack : null))
      .then((x) => !ac.signal.aborted && setPack(x))
      .catch(() => undefined);
    return () => ac.abort();
  }, [level]);

  // ---- one area's panel -------------------------------------------------------------------------------------------------
  useEffect(() => {
    setDetail(null);
    setDetailBad(false);
    if (!picked) return;
    const ac = new AbortController();
    const u = new URLSearchParams({ area: picked, period, compare: compare ? "previous" : "off" });
    if (categoryId) u.set("category", categoryId);
    fetch(`/api/admin/reports/geo-map/area?${u}`, { signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json()) as GeoMapAreaApiResponse;
        if (j.ok) setDetail(j.detail);
        else setDetailBad(true);
      })
      .catch(() => !ac.signal.aborted && setDetailBad(true));
    return () => ac.abort();
  }, [picked, period, compare, categoryId]);

  const data = loaded && "data" in loaded ? loaded.data : null;
  const moneyHidden = loaded && "data" in loaded ? loaded.moneyHidden : !p.moneyAllowed;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows]);
  const metricNow: GeoMetric = moneyHidden && metric === "sales" ? "orders" : metric;
  const max = useMemo(() => maxOf(rows, metricNow), [rows, metricNow]);
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);
  const shapes = useMemo(() => (pack ? pack.shapes.filter((s) => byCode.has(s.code)) : []), [pack, byCode]);
  const pins = useMemo(() => (setting.showPins ? rows.filter((r) => !shapes.some((s) => s.code === r.code)) : []), [rows, shapes, setting.showPins]);

  // ---- fit the map to what is drawn, and zoom ---------------------------------------------------------------------------
  const gRef = useRef<SVGGElement | null>(null);
  const [fit, setFit] = useState<string | null>(null);
  useLayoutEffect(() => {
    const g = gRef.current;
    if (!g || !shapes.length) return setFit(null);
    try {
      setFit(fitBox(g.getBBox(), 0.06));
    } catch {
      setFit(null);
    }
  }, [shapes]);
  useEffect(() => setView(fit), [fit]);
  const box = view ?? fit ?? pack?.viewBox ?? "0 0 100 100";

  function open(r: GeoAreaRow) {
    setPicked(r.areaId);
  }
  function drill(r: GeoAreaRow) {
    if (!childLevel(r.level)) return open(r);
    setTrail([...trail, { areaId: r.areaId, level: r.level, name: nameOf(r) }]);
    setPicked(null);
  }
  function up(to: number) {
    setTrail(trail.slice(0, to));
    setPicked(null);
  }
  function head(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  const money = useMemo(() => new Intl.NumberFormat(p.locale, { style: "currency", currency: p.currency, maximumFractionDigits: 0, numberingSystem: "latn" }), [p.locale, p.currency]);
  const num = useMemo(() => new Intl.NumberFormat(p.locale, { numberingSystem: "latn" }), [p.locale]);
  const sales = (minor: number | null) => (minor === null ? "—" : money.format(minor / 100)); // hardcode-ok: minor units to major, a unit fact
  const valueText = (r: GeoAreaRow) => {
    const v = metricValue(r.current, metricNow, r.previous);
    if (v === null) return "—";
    if (metricNow === "sales") return sales(v);
    if (metricNow === "returnRate") return pctText(v);
    return num.format(v);
  };
  const legendText = (m0: GeoMetric, v: number) => (m0 === "sales" ? sales(v) : m0 === "returnRate" ? pctText(v, 0) : num.format(Math.round(v)));
  const steps = setting.colourSteps;
  const warn = setting.warnReturnPct / 100; // hardcode-ok: per cent to a share, a unit fact
  const unknownPct = data?.unknownShare == null ? null : Math.round(data.unknownShare * 100); // hardcode-ok: share to per cent

  if (loaded && "error" in loaded && loaded.error === "not_on") return <p className="gm-note" data-testid="gm-off">{c.off}</p>;

  return (
    <div className="gm" data-testid="gm" data-level={level} data-busy={busy ? "1" : "0"}>
      <div className="gm-bar" role="group" aria-label={c.period}>
        {PERIODS.map((x) => (
          <button key={x} type="button" className={`gm-chip${period === x ? " on" : ""}`} aria-pressed={period === x} onClick={() => setPeriod(x)} data-testid={`gm-period-${x}`}>
            {c[`period.${x}`]}
          </button>
        ))}
        <label className="gm-check">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} data-testid="gm-compare" />
          <span>{c.compare}</span>
        </label>
      </div>

      <div className="gm-filters">
        <label className="gm-fld">
          <span>{c.figure}</span>
          <select value={metricNow} onChange={(e) => setMetric(e.target.value as GeoMetric)} data-testid="gm-metric">
            {METRICS.filter((m0) => !(moneyHidden && m0 === "sales")).map((m0) => (
              <option key={m0} value={m0}>
                {c[`metric.${m0}`]}
              </option>
            ))}
            {compare ? <option value="change">{c["metric.change"]}</option> : null}
          </select>
        </label>
        {setting.slices.categoryId !== false && p.categories.length ? (
          <label className="gm-fld">
            <span>{c.category}</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="gm-category">
              <option value="">{c.allCategories}</option>
              {p.categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <nav className="gm-trail" aria-label={c.trail} data-testid="gm-trail">
        <button type="button" onClick={() => up(0)} disabled={!trail.length} data-testid="gm-crumb-root">
          {c.country}
        </button>
        {trail.map((t, i) => (
          <span key={t.areaId ?? i}>
            <span aria-hidden="true"> › </span>
            <button type="button" onClick={() => up(i + 1)} disabled={i === trail.length - 1}>
              {t.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="gm-switch" role="group" aria-label={c.show}>
        {(["map", "list"] as const).map((x) => (
          <button key={x} type="button" className={`gm-chip${shown === x ? " on" : ""}`} aria-pressed={shown === x} onClick={() => setShown(x)} data-testid={`gm-show-${x}`}>
            {c[`show.${x}`]}
          </button>
        ))}
      </div>

      {loaded && "error" in loaded ? <p className="gm-note" role="alert">{c.failed}</p> : null}

      <div className="gm-body">
        <section className={`gm-mapbox${shown === "list" ? " gm-hide" : ""}`} aria-label={c.mapLabel}>
          <svg className="gm-svg" viewBox={box} role="img" aria-label={c.mapLabel} data-testid="gm-svg">
            <g ref={gRef} fillRule="evenodd">
              {shapes.map((s) => {
                const r = byCode.get(s.code)!;
                return (
                  <path
                    key={s.code}
                    d={s.d}
                    className={`gm-shape ${fillClass(r, metricNow, max, steps)}${picked === r.areaId ? " sel" : ""}${metricNow !== "returnRate" && r.current.returnRate !== null && r.current.returnRate >= warn ? " warn" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${nameOf(r)}: ${valueText(r)}`}
                    onClick={() => (childLevel(r.level) ? drill(r) : open(r))}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), childLevel(r.level) ? drill(r) : open(r))}
                    data-testid="gm-shape"
                  >
                    <title>{`${nameOf(r)}: ${valueText(r)}`}</title>
                  </path>
                );
              })}
            </g>
            {pins.map((r) => {
              if (r.lat === null || r.lng === null) return null;
              const [x, y] = project([r.lng, r.lat]) as [number, number];
              const w = Number(box.split(" ")[2]) || 1000;
              return (
                <circle
                  key={r.areaId}
                  cx={x}
                  cy={y}
                  r={w / 60}
                  className={`gm-pin ${fillClass(r, metricNow, max, steps)}${picked === r.areaId ? " sel" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${nameOf(r)}: ${valueText(r)}`}
                  onClick={() => open(r)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(r))}
                  data-testid="gm-pin"
                >
                  <title>{`${nameOf(r)}: ${valueText(r)}`}</title>
                </circle>
              );
            })}
          </svg>
          <div className="gm-zoom">
            <button type="button" aria-label={c.zoomIn} onClick={() => setView(zoomBox(box, 1.5))} data-testid="gm-zoom-in">+</button>
            <button type="button" aria-label={c.zoomOut} onClick={() => setView(zoomBox(box, 1 / 1.5))} data-testid="gm-zoom-out">−</button>
            <button type="button" aria-label={c.zoomReset} onClick={() => setView(fit)} data-testid="gm-zoom-reset">⟲</button>
          </div>
          <div className="gm-legend" data-testid="gm-legend">
            <span>{legendText(metricNow, 0)}</span>
            <span className="gm-ramp" aria-hidden="true">
              {Array.from({ length: steps }, (_, i) => (
                <i key={i} className={`gm-s${i}`} />
              ))}
            </span>
            <span>{legendText(metricNow, max)}</span>
            <span className="gm-key"><i className="gm-none" /> {c.legendNone.replace("{n}", String(setting.minOrders))}</span>
          </div>
          {!shapes.length && pack && rows.length ? <p className="gm-note">{c.noShapes}</p> : null}
        </section>

        <section className={`gm-list${shown === "map" ? " gm-hide-phone" : ""}`} aria-label={c.tableLabel}>
          {unknownPct !== null && unknownPct > 0 ? (
            <p className="gm-unknown" data-testid="gm-unknown">{c.unknown.replace("{pct}", String(unknownPct))}</p>
          ) : null}
          <div className="gm-scroll">
            <table className="gm-table" data-testid="gm-table">
              <thead>
                <tr>
                  {(["name", "orders", "delivered", ...(moneyHidden ? [] : (["sales"] as const)), "returned", "returnRate"] as SortKey[]).map((k) => (
                    <th key={k} scope="col" aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" onClick={() => head(k)} data-testid={`gm-sort-${k}`}>
                        {c[`col.${k}`]}
                        {sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.areaId} className={picked === r.areaId ? "sel" : ""} data-testid="gm-row">
                    <th scope="row">
                      <button type="button" onClick={() => drill(r)}>{nameOf(r)}</button>
                    </th>
                    <td>{num.format(r.current.orders)}</td>
                    <td>{num.format(r.current.delivered)}</td>
                    {moneyHidden ? null : <td>{sales(r.current.salesMinor)}</td>}
                    <td>{num.format(r.current.returned)}</td>
                    <td className={r.current.returnRate !== null && r.current.returnRate >= warn ? "warn" : ""}>{pctText(r.current.returnRate)}</td>
                  </tr>
                ))}
                {data ? (
                  <tr className="gm-total">
                    <th scope="row">{c.total}</th>
                    <td>{num.format(data.total.orders)}</td>
                    <td>{num.format(data.total.delivered)}</td>
                    {moneyHidden ? null : <td>{sales(data.total.salesMinor)}</td>}
                    <td>{num.format(data.total.returned)}</td>
                    <td>{pctText(data.total.returnRate)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {data && !rows.length ? <p className="gm-note">{c.empty}</p> : null}
          <p className="gm-credit">{c.credit}</p>
        </section>
      </div>

      {picked ? (
        <aside className="gm-panel" role="dialog" aria-label={c.panel} data-testid="gm-panel">
          <button type="button" className="gm-close" onClick={() => setPicked(null)} aria-label={c.close}>×</button>
          {(() => {
            const r = rows.find((x) => x.areaId === picked);
            return r ? <h3>{nameOf(r)}</h3> : null;
          })()}
          {detailBad ? <p className="gm-note">{c.failed}</p> : null}
          {!detail && !detailBad ? <p className="gm-note">{c.loading}</p> : null}
          {detail ? (
            <div>
              <dl className="gm-facts">
                <div><dt>{c["col.orders"]}</dt><dd>{num.format(detail.current.orders)}</dd></div>
                <div><dt>{c["col.delivered"]}</dt><dd>{num.format(detail.current.delivered)}</dd></div>
                {moneyHidden ? null : <div><dt>{c["col.sales"]}</dt><dd>{sales(detail.current.salesMinor)}</dd></div>}
                <div><dt>{c["col.returned"]}</dt><dd>{num.format(detail.current.returned)}</dd></div>
                <div><dt>{c["col.returnRate"]}</dt><dd>{pctText(detail.current.returnRate)}</dd></div>
              </dl>
              {detail.topCategory ? <p>{c.topCategory}: <b>{lang === "bn" && detail.topCategory.nameBn ? detail.topCategory.nameBn : detail.topCategory.nameEn}</b></p> : null}
              {detail.topProducts.length ? (
                <>
                  <h4>{c.topProducts}</h4>
                  <ol className="gm-top">
                    {detail.topProducts.slice(0, setting.topProducts).map((t) => (
                      <li key={t.productId}>
                        {lang === "bn" && t.nameBn ? t.nameBn : t.nameEn} · {num.format(t.pieces)} {c.pieces}
                        {moneyHidden ? "" : ` · ${sales(t.salesMinor)}`}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

