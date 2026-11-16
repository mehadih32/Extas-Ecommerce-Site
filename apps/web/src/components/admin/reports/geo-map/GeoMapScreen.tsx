"use client";
// S29 · PR 753 — Reports › Geography map: the screen. A map of Bangladesh drawn from the boundary pack (PR 750) and coloured
// by one figure, with the period bar, the figure picker, the category and product filters, the drill-down (division →
// district → upazila → areas of Dhaka City) with a trail, the "Unknown area" line, a sortable table and the one-area panel.
// It reads the routes of PR 752 and only draws: no figure is worked out here, no number is typed here (the colour steps, the
// minimum orders and the warning rate come from the setting). Phone: the map over the list, big zoom buttons, a Map / List
// switch, the panel as a sheet from the bottom, text never under 14 px. Words come in as `c` (messages/admin-geo-map.*).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { project } from "@extas/delivery/geo-pack";
import {
  shownSlices,
  slicesFromSearch,
  SLICE_DIMENSIONS,
  type CourierLensResponse,
  type LensResult,
  type SliceDimension,
} from "@extas/metrics";
import type {
  GeoByArea,
  GeoCompare,
  GeoAreaRow,
  GeoLevel,
  GeoMapApiResponse,
  GeoMapSetting,
  GeoMetric,
  GeoPack,
} from "@extas/metrics/geo-types";
import type { GeoSlicesApiResponse } from "@/lib/geo-map/api";
import { compareFromSearch, compareRange } from "@/lib/geo-map/compare";
import { geoDict } from "@/lib/geo-map/dicts";
import { t } from "@/lib/i18n";
import { DRAWN_LENSES, type DrawnLens } from "@/lib/geo-map/lens-view";
import {
  geoAdvisorLabels,
  geoLensTableLabels,
} from "@/lib/geo-map/lenses-words";
import { panelModel } from "@/lib/geo-map/panel";
import {
  geoSlicesLabels,
  geoSliceTableLabels,
  sliceValueName,
} from "@/lib/geo-map/slices-words";
import { geoLensLabels } from "@/lib/geo-map/lens-words";
import { geoCompareLabels, geoPanelLabels } from "@/lib/geo-map/words";
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
import { GeoAdvisor } from "../GeoAdvisor";
import { GeoCompareBar } from "../GeoCompareBar";
import { GeoCourierLens } from "../GeoCourierLens";
import { GeoLensTable } from "../GeoLensTable";
import { GeoPanel } from "../GeoPanel";
import { GeoSliceTable } from "../GeoSliceTable";
import { GeoSlicesBar } from "../GeoSlicesBar";
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
  /** The shop's couriers, for the Courier slice and the "Orders by courier" table. */
  couriers: { id: string; name: string }[];
  /** The viewer may run the advisor (`ai.control`; the server checks it again). */
  canControlAi: boolean;
}

/** The address parts the screen's figures read (everything else in the address is left alone). */
const FIGURE_KEYS = [
  "period",
  "from",
  "to",
  "compare",
  "cfrom",
  "cto",
  "cat",
  "product",
  "channel",
  "pay",
  "courier",
  "cust",
] as const;
const COMPARE_KEYS = ["compare", "cfrom", "cto"];
const LENS_KEYS = ["courier", ...DRAWN_LENSES] as const;
type LensKey = (typeof LENS_KEYS)[number];

type Json<T> =
  { state: "loading" } | { state: "error" } | { state: "ok"; value: T };

/** One GET answered as JSON; "loading" while the address changes, "error" when it fails or the server says no. */
function useJson<T>(url: string | null): Json<T> {
  const [got, setGot] = useState<{ url: string; value: T | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    fetch(url, { signal: ac.signal, headers: { accept: "application/json" } })
      .then(async (r) => {
        const j = (await r.json()) as { ok?: boolean } & T;
        setGot({ url, value: j.ok === false ? null : j });
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setGot({ url, value: null });
      });
    return () => ac.abort();
  }, [url]);
  if (!url || got?.url !== url) return { state: "loading" };
  return got.value ? { state: "ok", value: got.value } : { state: "error" };
}

const PERIODS = ["day", "month", "sixMonths", "year"] as const;
const METRICS: Exclude<GeoMetric, "change">[] = ["orders", "sales", "delivered", "returned", "returnRate"];

type Loaded = { data: GeoByArea; moneyHidden: boolean } | { error: string };

export function GeoMapScreen(p: GeoMapScreenProps) {
  const { c, setting, lang } = p;
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const spObj = useMemo(() => Object.fromEntries(sp.entries()), [sp]);
  // the period, compare, slices, lens and table dimension live in the address (a view can be shared; Back works)
  const periodNow = (PERIODS as readonly string[]).includes(spObj.period ?? "")
    ? (spObj.period as (typeof PERIODS)[number])
    : spObj.period === "custom"
      ? "custom"
      : setting.defaultPeriod;
  const { mode: compareMode, custom: compareCustom } = compareFromSearch(
    spObj,
    setting.compareDefault,
  );
  const compare = compareMode !== "off";
  const slices = useMemo(() => slicesFromSearch(spObj), [spObj]);
  const categoryId = slices.categoryId ?? "";
  const lensOn = LENS_KEYS;
  const lens: "overview" | LensKey = (lensOn as readonly string[]).includes(
    spObj.lens ?? "",
  )
    ? (spObj.lens as LensKey)
    : "overview";
  const [metric, setMetric] = useState<GeoMetric>(setting.defaultMetric);
  const [trail, setTrail] = useState<Crumb[]>([]);
  const [shown, setShown] = useState<"map" | "list">("map");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "orders", dir: "desc" });
  const [picked, setPicked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [pack, setPack] = useState<GeoPack | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(periodNow === "custom");
  const [rangeBad, setRangeBad] = useState(false);

  const here = trail[trail.length - 1];
  const level: GeoLevel = here ? (childLevel(here.level) ?? here.level) : "division";
  const parentId = here?.areaId ?? null;
  const nameOf = useCallback((r: { nameEn: string; nameBn: string | null }) => (lang === "bn" && r.nameBn ? r.nameBn : r.nameEn), [lang]);

  /** The address with some parts changed (an empty value takes the part out). */
  const addressWith = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch))
        v ? next.set(k, v) : next.delete(k);
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [sp, pathname],
  );
  const go = (patch: Record<string, string | undefined>) =>
    router.replace(addressWith(patch), { scroll: false });

  // ---- the figures --------------------------------------------------------------------------------------------------
  /** The figures' own query: the address parts they read. The panel, the slice table and the lenses reuse it. */
  const figureQuery = useMemo(() => {
    const u = new URLSearchParams();
    for (const k of FIGURE_KEYS) if (spObj[k]) u.set(k, spObj[k]!);
    if (!u.has("period")) u.set("period", setting.defaultPeriod);
    if (!u.has("compare")) u.set("compare", compareMode);
    return u;
    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- the query string is built from the address parts the figures read
  }, [spObj, setting.defaultPeriod, compareMode]);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- the query string is built from the address parts the figures read
  const query = useMemo(() => {
    const u = new URLSearchParams(figureQuery);
    u.set("level", level);
    if (parentId) u.set("parent", parentId);
    return u.toString();
  }, [figureQuery, level, parentId]);

  useEffect(() => {
    const ac = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the loading flag is set when a new request starts
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

  const data = loaded && "data" in loaded ? loaded.data : null;
  const moneyHidden = loaded && "data" in loaded ? loaded.moneyHidden : !p.moneyAllowed;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows]);
  const metricNow: GeoMetric =
    (moneyHidden && metric === "sales") || (!compare && metric === "change")
      ? "orders"
      : metric;
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
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the map view follows the fitted box when the shapes change
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
  const legendText = (m0: GeoMetric, v: number) =>
    m0 === "sales"
      ? sales(v)
      : m0 === "returnRate"
        ? pctText(v, 0)
        : num.format(Math.round(v));
  // ---- the words of the parts the screen mounts, built here from the dictionaries (functions cannot come from the server) ----
  const dictView = useMemo(() => ({ dict: geoDict(lang) }), [lang]);
  const words = (key: string) => t(dictView.dict, key);
  const compareLabels = useMemo(() => geoCompareLabels(dictView), [dictView]);
  const slicesLabels = useMemo(() => geoSlicesLabels(dictView), [dictView]);
  const sliceTableLabels = useMemo(
    () => geoSliceTableLabels(dictView),
    [dictView],
  );
  const panelLabels = useMemo(() => geoPanelLabels(dictView), [dictView]);
  const courierLabels = useMemo(() => geoLensLabels(dictView), [dictView]);
  const advisorLabels = useMemo(() => geoAdvisorLabels(dictView), [dictView]);
  const sliceKeys = useMemo(() => shownSlices(), []);
  const fmt = {
    number: (n: number) => num.format(n),
    money: (minor: number) => money.format(minor / 100),
  }; // hardcode-ok: minor units to major
  const placeName = (r: { nameEn: string; nameBn: string | null }) => nameOf(r);

  // ---- the lens on show (the courier lens and the three others share one route) ----
  // the lens routes read the report period as two days (the map's own "6 months" is not one of the report's quick periods)
  const days = data?.query.days ?? null;
  const lensUrl =
    lens === "overview" || !days
      ? null
      : `/api/admin/reports/geo-map/lens?${new URLSearchParams({ lens, from: days.from, to: days.to, level, ...(parentId ? { parent: parentId } : {}) })}`;
  const courier = useJson<CourierLensResponse>(
    lens === "courier" ? lensUrl : null,
  );
  const other = useJson<LensResult & { lens: DrawnLens }>(
    lens !== "overview" && lens !== "courier" ? lensUrl : null,
  );

  // ---- "Orders by …" (the order-level slices) ----
  const dimensions = SLICE_DIMENSIONS.filter((d) =>
    sliceKeys.includes(d === "courier" ? "courierId" : d),
  );
  const by: SliceDimension | null = (dimensions as readonly string[]).includes(
    spObj.by ?? "",
  )
    ? (spObj.by as SliceDimension)
    : (dimensions[0] ?? null);
  const slicesUrl = by
    ? `/api/admin/reports/geo-map/slices?${new URLSearchParams({ ...Object.fromEntries(figureQuery), by })}`
    : null;
  const table = useJson<Extract<GeoSlicesApiResponse, { ok: true }>>(slicesUrl);
  const courierNames = useMemo(
    () => new Map(p.couriers.map((x) => [x.id, x.name])),
    [p.couriers],
  );

  const steps = setting.colourSteps;
  const warn = setting.warnReturnPct / 100; // hardcode-ok: per cent to a share, a unit fact
  const unknownPct = data?.unknownShare == null ? null : Math.round(data.unknownShare * 100); // hardcode-ok: share to per cent

  return (
    <div className="gm" data-testid="gm" data-level={level} data-busy={busy ? "1" : "0"}>
      <div className="gm-bar" role="group" aria-label={c.period}>
        {PERIODS.map((x) => (
          <button
            key={x}
            type="button"
            className={`gm-chip${periodNow === x ? " on" : ""}`}
            aria-pressed={periodNow === x}
            onClick={() => {
              setRangeOpen(false);
              go({ period: x, from: undefined, to: undefined });
            }}
            data-testid={`gm-period-${x}`}
          >
            {c[`period.${x}`]}
          </button>
        ))}
        <button
          type="button"
          className={`gm-chip${periodNow === "custom" ? " on" : ""}`}
          aria-pressed={periodNow === "custom"}
          aria-expanded={rangeOpen}
          onClick={() => setRangeOpen((v) => !v)}
          data-testid="gm-period-custom"
        >
          {c["period.custom"]}
        </button>
      </div>
      {rangeOpen ? (
        <form
          className="gm-range"
          data-testid="gm-range"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const from = String(f.get("from") ?? "");
            const to = String(f.get("to") ?? "");
            if (!from || !to || from > to) return setRangeBad(true);
            setRangeBad(false);
            go({ period: "custom", from, to });
          }}
        >
          <label>
            <span>{c["range.from"]}</span>
            <input
              type="date"
              name="from"
              defaultValue={spObj.from ?? ""}
              required
            />
          </label>
          <label>
            <span>{c["range.to"]}</span>
            <input
              type="date"
              name="to"
              defaultValue={spObj.to ?? ""}
              required
            />
          </label>
          <button type="submit" className="a2-btn sm pri">
            {c["range.apply"]}
          </button>
          {rangeBad ? (
            <span className="gm-note" role="alert">
              {c["range.invalid"]}
            </span>
          ) : null}
        </form>
      ) : null}

      {data ? (
        <GeoCompareBar
          mode={compareMode}
          days={data.query.days}
          custom={compareCustom}
          range={
            compare
              ? (data.query.compareDays ??
                compareRange(data.query.days, compareMode, compareCustom))
              : null
          }
          base={Object.fromEntries(
            Object.entries(spObj).filter(([k]) => !COMPARE_KEYS.includes(k)),
          )}
          path={pathname}
          labels={compareLabels}
        />
      ) : null}

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
        {p.categories.length ? (
          <label className="gm-fld">
            <span>{c.category}</span>
            <select
              value={categoryId}
              onChange={(e) => go({ cat: e.target.value || undefined })}
              data-testid="gm-category"
            >
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

      {sliceKeys.length ? (
        <GeoSlicesBar
          shown={sliceKeys}
          slices={slices}
          couriers={p.couriers}
          base={spObj}
          path={pathname}
          labels={slicesLabels}
        />
      ) : null}

      {lensOn.length ? (
        <div
          className="gm-bar"
          role="group"
          aria-label={words("geoLenses.tabsLabel")}
          data-testid="gm-lenses"
        >
          {(["overview", ...lensOn] as const).map((k) => (
            <Link
              key={k}
              href={addressWith({ lens: k === "overview" ? undefined : k })}
              scroll={false}
              className={`gm-chip${lens === k ? " on" : ""}`}
              aria-current={lens === k ? "true" : undefined}
              data-testid={`gm-lens-${k}`}
            >
              {words(`geoLenses.tab.${k}`)}
            </Link>
          ))}
        </div>
      ) : null}

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

      {picked
        ? (() => {
            const r = rows.find((x) => x.areaId === picked);
            if (!r || !data) return null;
            const days = data.query.days;
            return (
              <GeoPanel
                key={r.areaId}
                model={panelModel(r, {
                  days,
                  compare,
                  moneyHidden,
                  warnReturnPct: setting.warnReturnPct,
                })}
                name={nameOf(r)}
                parent={here?.name ?? null}
                compared={compare ? (data.query.compareDays ?? null) : null}
                labels={panelLabels}
                fmt={{
                  ...fmt,
                  name: (en, bn) => (lang === "bn" && bn ? bn : en),
                }}
                query={query}
                topN={setting.topProducts}
                moneyHidden={moneyHidden}
                minOrders={setting.minOrders}
                warnReturnPct={setting.warnReturnPct}
                onClose={() => setPicked(null)}
                onDeeper={() => drill(r)}
              />
            );
          })()
        : null}

      {lens !== "overview" ? (
        <div className="gm-lens" data-testid="gm-lens-body">
          {lens === "courier" ? (
            courier.state === "ok" ? (
              <GeoCourierLens
                data={courier.value}
                labels={courierLabels}
                nameOf={(id) => {
                  const r = rows.find((x) => x.areaId === id);
                  const n =
                    r ??
                    courier.value.places[id] ??
                    courier.value.gaps.find((g) => g.areaId === id);
                  return n ? placeName(n) : id;
                }}
                fmt={{ number: fmt.number, pct: (ratio) => pctText(ratio, 0) }}
              />
            ) : (
              <p
                className="gm-note"
                role={courier.state === "error" ? "alert" : undefined}
              >
                {courier.state === "error"
                  ? words("geoLenses.failed")
                  : words("geoLenses.loading")}
              </p>
            )
          ) : other.state === "ok" ? (
            <GeoLensTable
              lens={lens}
              data={other.value}
              labels={geoLensTableLabels(dictView, lens)}
              fmt={fmt}
              nameOf={placeName}
            />
          ) : (
            <p
              className="gm-note"
              role={other.state === "error" ? "alert" : undefined}
            >
              {other.state === "error"
                ? words("geoLenses.failed")
                : words("geoLenses.loading")}
            </p>
          )}
        </div>
      ) : null}

      {by && table.state === "ok" ? (
        <GeoSliceTable
          data={table.value.data}
          labels={sliceTableLabels}
          valueName={(d, key) =>
            sliceValueName(
              dictView,
              d,
              key,
              new Map([
                ...courierNames,
                ...table.value.couriers.map((x) => [x.id, x.name] as const),
              ]),
            )
          }
          hrefFor={(d) => addressWith({ by: d })}
          fmt={fmt}
        />
      ) : null}

      {
        <GeoAdvisor
          labels={advisorLabels}
          period={
            days
              ? new URLSearchParams({ from: days.from, to: days.to }).toString()
              : ""
          }
          lang={lang}
          mayRun={p.canControlAi}
          fmtDate={(iso) =>
            new Intl.DateTimeFormat(p.locale, {
              dateStyle: "medium",
              numberingSystem: "latn",
            }).format(new Date(iso))
          }
        />
      }
    </div>
  );
}

