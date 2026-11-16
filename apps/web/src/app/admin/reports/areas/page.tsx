// S16 · PR 568 — Reports → Sales by area at /admin/reports/areas (B3.10 Locked: "sales by district and thana, and by area
// inside Dhaka, as a table and a map, with the return rate per area"; BACKEND-ARCHITECTURE §5 REP-02): for any period
// (one-press or from/to, `costs.report`), by district, upazila/thana or area inside Dhaka City, for the whole shop, a
// category (with its sub-categories) or one product — Sales of delivered orders, pieces, returned orders and the return
// rate of each area, a map of the areas that have a map point, and the CSV. Seeing needs `books.read`. Read-only.
// The figure is lib/area-sales.ts (@extas/metrics salesByArea). Words: messages/admin-areas.*.json.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { AREA_LEVELS, type AreaFigures } from "@extas/metrics";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { SummaryTiles } from "@/components/admin/lumen/SummaryTiles";
import { formatNumber, moneyOf } from "@/components/admin/products/model";
import { AreaMap } from "@/components/admin/reports/AreaMap";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { adminDeps } from "@/lib/admin-auth";
import { figureTiles, type ReportFigure } from "@/lib/admin-lumen/figures";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { areaReport, findAreaProducts, ratePct } from "@/lib/area-sales";
import { ReportAreasProto } from "@/components/admin/reports/ReportAreasProto";
import { ReportBar } from "@/components/admin/reports/ReportBar";
import { withReportsV5 } from "@/lib/reports-v5/words";
import { makeFmt } from "@/lib/reports-v5/fmt";
import { loadBase, loadViews } from "@/lib/reports-v5/load";
import { withProtoPeriod } from "@/lib/reports-v5/period";
import { AREA_METRICS, loadGeoOrders } from "@/lib/reports-v5/areas";
import { PLACE_LEVELS } from "@/lib/reports-v5/geo";
import { SALE_SOURCES, isSaleSource } from "@/lib/reports-v5/sales";
import "@/components/admin/reports/report-bar.css";
import { t, type Dict } from "@/lib/i18n";
import bn from "../../../../../messages/admin-areas.bn.json";
import en from "../../../../../messages/admin-areas.en.json";
import geoBn from "../../../../../messages/admin-geo-map.bn.json";
import geoEn from "../../../../../messages/admin-geo-map.en.json";
import reportBn from "../../../../../messages/admin-cost-report.bn.json";
import reportEn from "../../../../../messages/admin-cost-report.en.json";
import "../../settings-cards.css";
import "../../money/money.css";

export const dynamic = "force-dynamic";

const KEY = "reportsAreas";
const HERE = "/admin/reports/areas";
/** How many products "Find a product" lists. */
const FOUND = 10;

function withScreen(view: AdminView): AdminView {
  const b = view.lang === "bn";
  return {
    ...view,
    dict: {
      ...view.dict,
      reportsAreas: (b ? bn : en).reportsAreas as unknown as Dict,
      moneyCostReport: (b ? reportBn : reportEn)
        .moneyCostReport as unknown as Dict,
      reportsGeoMapLink: {
        openOnMap: (b ? geoBn : geoEn).reportsGeoMap.openOnMap,
      } as unknown as Dict,
    },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: `${t(view.dict, "reportsAreas.metaTitle")} · ${t(view.dict, "shell.admin")}`,
    robots: { index: false, follow: false },
  };
}

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([
    adminView(deps),
    pageAccess("books.read", deps, MOTHER_STORE_ID),
    searchParams,
  ]);
  const view = withScreen(withReportsV5(plain));
  if (access.kind === "login" || access.kind === "password")
    redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable")
    return (
      <AdminNotice view={view} current={KEY} text={t(view.dict, "page.noDb")} />
    );
  if (access.kind === "forbidden")
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="areas-page">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) =>
    t(d, `reportsAreas.${k}`, vars);
  const pc = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.areas.${k}`, v);
  const cr = (k: string) => t(d, `moneyCostReport.${k}`);
  const db = access.deps.db;
  // S29 · PR 753: the link to the Geography map shows only while that map is on (off as shipped)
  const geoOn = (await access.deps.resolver.value("reports.geoMap", { storeId: MOTHER_STORE_ID })).on;
  const base = await loadBase(access.deps, sp);
  const { currency, timeZone, limits } = base;
  const findText = typeof sp.find === "string" ? sp.find : "";
  const cmp = sp.cmp !== "0";
  const ch = isSaleSource(sp.ch) ? sp.ch : "all";
  const catId =
    typeof sp.cat === "string" && /^[0-9a-f-]{36}$/i.test(sp.cat)
      ? sp.cat
      : null;
  const path = (typeof sp.path === "string" ? sp.path : "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, PLACE_LEVELS.length - 1);
  const pathText = path.join("/");
  const metric = AREA_METRICS.find((m0) => m0 === sp.m) ?? "v";
  const viewMode = sp.view === "bars" ? "bars" : "map";
  const [r, categories, found, geo, geoWas, views] = await Promise.all([
    areaReport(
      access.deps,
      MOTHER_STORE_ID,
      withProtoPeriod(sp, base.today),
      limits,
      timeZone,
    ),
    db.category.findMany({
      where: { storeId: MOTHER_STORE_ID, archivedAt: null },
      select: { id: true, nameEn: true, nameBn: true, parentId: true },
      orderBy: { nameEn: "asc" },
    }),
    findAreaProducts(db, MOTHER_STORE_ID, findText, FOUND),
    loadGeoOrders(access.deps, timeZone, base.period.q.from, base.period.q.to, {
      source: ch === "all" ? null : ch,
      catId,
    }),
    loadGeoOrders(access.deps, timeZone, base.before.from, base.before.to, {
      source: ch === "all" ? null : ch,
      catId,
    }),
    loadViews(access, "areas"),
  ]);
  const { q, notes } = r.period;
  const bnLang = view.lang === "bn";
  const nameOf = (x: { nameEn: string; nameBn: string | null }) =>
    bnLang && x.nameBn ? x.nameBn : x.nameEn;
  const catName = new Map(categories.map((x) => [x.id, nameOf(x)]));
  const kids = new Map<string, string[]>();
  for (const x of categories)
    if (x.parentId)
      kids.set(x.parentId, [...(kids.get(x.parentId) ?? []), x.id]);
  const catTrees = new Map<string, Set<string>>();
  for (const x of categories) {
    const set = new Set<string>([x.id]);
    const walk = (id: string) =>
      kids.get(id)?.forEach((k) => !set.has(k) && (set.add(k), walk(k)));
    walk(x.id);
    catTrees.set(x.id, set);
  }
  const fmt = makeFmt(view.locale, currency);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => fmt.amount(minor);
  const dayText = (day: string) =>
    new Intl.DateTimeFormat(view.locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
      numberingSystem: "latn",
    }).format(new Date(`${day}T00:00:00Z`));
  const today = r.today;
  const protoHref = (o: {
    path?: readonly string[];
    m?: string;
    view?: string;
    pick?: string;
  }) => {
    const u = new URLSearchParams();
    u.set("p", typeof sp.p === "string" ? sp.p : "custom");
    u.set("from", q.from);
    u.set("to", q.to);
    if (!cmp) u.set("cmp", "0");
    if (ch !== "all") u.set("ch", ch);
    if (catId) u.set("cat", catId);
    const pth = (o.path ?? path).join("/");
    if (pth) u.set("path", pth);
    u.set("m", o.m ?? metric);
    u.set("view", o.view ?? viewMode);
    const pk = o.pick ?? (typeof sp.pick === "string" ? sp.pick : "");
    if (pk) u.set("pick", pk);
    return `${HERE}?${u.toString()}`;
  };
  // keep the level, category and product when the period changes, and the other way round
  const keep = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const base: Record<string, string | null> = {
      level: r.area.level,
      category: r.area.categoryId,
      product: r.area.productId,
      ...extra,
    };
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    return `${HERE}?${u.toString()}`;
  };
  const s = r.sales;
  const rateText = (f: AreaFigures) =>
    f.returnRate === null
      ? c("table.noRate")
      : c("table.rate", { pct: ratePct(f.returnRate)! });
  const num = (x: number) => formatNumber(x, view.locale);

  const kpis: ReportFigure[] = [
    {
      id: "sales",
      label: c("kpi.sales"),
      value: m(s.total.salesMinor),
      n: s.total.salesMinor,
      kind: "money",
      foot: c("kpi.orders", { n: num(s.total.delivered) }),
    },
    {
      id: "pieces",
      label: c("kpi.pieces"),
      value: num(s.total.pieces),
      n: s.total.pieces,
    },
    {
      id: "returned",
      label: c("kpi.returned"),
      value: num(s.total.returned),
      n: s.total.returned,
    },
    {
      id: "rate",
      label: c("kpi.rate"),
      value:
        s.total.returnRate === null ? "—" : `${ratePct(s.total.returnRate)}%`,
      n: s.total.returnRate,
      kind: "percent",
    },
    {
      id: "areas",
      label: c("kpi.areas"),
      value: num(s.rows.length),
      n: s.rows.length,
    },
  ];
  const cut = s.rows.length > limits.maxDayRows;
  const extraRows: {
    key: string;
    label: string;
    how: string;
    f: AreaFigures;
  }[] = [
    ...(s.unknown.delivered || s.unknown.returned
      ? [
          {
            key: "unknown",
            label: c("table.unknown"),
            how: c("table.unknownHow"),
            f: s.unknown,
          },
        ]
      : []),
    ...(s.level === "dhaka" && (s.outside.delivered || s.outside.returned)
      ? [
          {
            key: "outside",
            label: c("table.outside"),
            how: c("table.outsideHow"),
            f: s.outside,
          },
        ]
      : []),
  ];
  const csv = `/api/admin/reports/areas?from=${q.from}&to=${q.to}&level=${r.area.level}${r.area.categoryId ? `&category=${r.area.categoryId}` : ""}${r.area.productId ? `&product=${r.area.productId}` : ""}`;

  return (
    <div
      className="a2-z lm-rp"
      data-lm-ready=""
      data-testid="areas-page"
      data-from={q.from}
      data-to={q.to}
      data-level={r.area.level}
    >
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={t(d, "reportsV5.common.pageTitle")}
        sub={pc("sub")}
      />
      <SectionTabs view={view} current={KEY} />
      {geoOn ? (
        <p className="a2-mt12">
          <Link className="a2-btn cr-tap" href="/admin/reports/geo-map" data-testid="ar-open-map">
            {t(d, "reportsGeoMapLink.openOnMap")}
          </Link>
        </p>
      ) : null}

      <ReportBar
        dict={d}
        here={HERE}
        id="rp"
        from={q.from}
        to={q.to}
        today={today}
        p={typeof sp.p === "string" ? sp.p : undefined}
        cmp={cmp}
        before={base.before}
        reportKey="areas"
        views={views}
        day={fmt.dayShort}
        csv={`/api/admin/reports/export/areas?from=${q.from}&to=${q.to}${pathText ? `&path=${encodeURIComponent(pathText)}` : ""}${ch === "all" ? "" : `&ch=${ch}`}`}
        notes={notes}
        limitDays={limits.maxDays}
      />
      <form className="rpf" action={HERE} method="get" data-testid="rp-filters">
        {Object.entries({
          p: typeof sp.p === "string" ? sp.p : "custom",
          from: q.from,
          to: q.to,
          path: pathText,
          m: metric,
          view: viewMode,
          pick: typeof sp.pick === "string" ? sp.pick : "",
        })
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        {cmp ? null : <input type="hidden" name="cmp" value="0" />}
        <label className="a2-xs a2-mute" htmlFor="rp-f-ch">
          {pc("fChannel")}
        </label>
        <select
          id="rp-f-ch"
          name="ch"
          className="a2-inp"
          defaultValue={ch}
          data-testid="rp-f-ch"
        >
          <option value="all">{pc("fAll")}</option>
          {SALE_SOURCES.map((x) => (
            <option key={x} value={x}>
              {t(d, `reportsV5.orders.src.${x}`)}
            </option>
          ))}
        </select>
        <label className="a2-xs a2-mute" htmlFor="rp-f-cat">
          {pc("fCategory")}
        </label>
        <select
          id="rp-f-cat"
          name="cat"
          className="a2-inp"
          defaultValue={catId ?? ""}
          data-testid="rp-f-cat"
        >
          <option value="">{pc("fAll")}</option>
          {categories.map((x) => (
            <option key={x.id} value={x.id}>
              {x.parentId && catName.has(x.parentId)
                ? `${nameOf(x)} (${catName.get(x.parentId)})`
                : nameOf(x)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="a2-btn sm cr-tap"
          data-testid="rp-f-apply"
        >
          {pc("apply")}
        </button>
        {ch === "all" && !catId ? null : (
          <Link
            className="a2-btn sm ghost cr-tap"
            href={`${HERE}?p=${typeof sp.p === "string" ? sp.p : "custom"}&from=${q.from}&to=${q.to}${cmp ? "" : "&cmp=0"}`}
            data-testid="rp-f-clear"
          >
            {pc("fClear")}
          </Link>
        )}
      </form>
      <ReportAreasProto
        orders={geo}
        prev={geoWas}
        path={path}
        metric={metric}
        view={viewMode}
        pick={typeof sp.pick === "string" ? sp.pick : ""}
        cmp={cmp}
        c={pc}
        f={fmt}
        locale={view.locale}
        href={protoHref}
        cats={categories.map((x) => ({ id: x.id, name: nameOf(x) }))}
        catIds={(id) => [...(catTrees.get(id) ?? [id])]}
        keep={{
          p: typeof sp.p === "string" ? sp.p : "custom",
          from: q.from,
          to: q.to,
          ...(cmp ? {} : { cmp: "0" }),
          ...(ch === "all" ? {} : { ch }),
          ...(catId ? { cat: catId } : {}),
        }}
        action={HERE}
      />

      <details className="a2-mt12" data-testid="ar-older">
        <summary className="a2-h4 a2-more-opts">{pc("older")}</summary>
        <p className="a2-xs a2-mute">{pc("olderSub")}</p>
        <form
          className="a2-card a2-mt12"
          action={HERE}
          method="get"
          aria-label={cr("form.label")}
          data-testid="ar-form"
        >
          <div className="ct-grid">
            <input type="hidden" name="from" value={q.from} />
            <input type="hidden" name="to" value={q.to} />
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="ar-level">
                {c("level.label")}
              </label>
              <select
                id="ar-level"
                name="level"
                className="a2-inp"
                defaultValue={r.area.level}
                data-testid="ar-level"
              >
                {AREA_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {c(`level.${l}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="ar-cat">
                {c("filter.category")}
              </label>
              <select
                id="ar-cat"
                name="category"
                className="a2-inp"
                defaultValue={r.area.categoryId ?? ""}
                data-testid="ar-cat"
              >
                <option value="">{c("filter.all")}</option>
                {categories.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.parentId && catName.has(x.parentId)
                      ? `${nameOf(x)} (${catName.get(x.parentId)})`
                      : nameOf(x)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {r.product ? (
            <input type="hidden" name="product" value={r.product.id} />
          ) : null}
          <div className="ct-actions a2-mt12">
            <button type="submit" className="a2-btn pri" data-testid="ar-show">
              {cr("form.show")}
            </button>
            <a className="a2-btn" href={csv} download data-testid="ar-export">
              {c("export")}
            </a>
          </div>
          {notes
            .filter((n) => n !== "byMonth")
            .map((n) => (
              <p
                key={n}
                className="a2-xs bk-warn a2-mt12"
                data-testid={`ar-note-${n}`}
              >
                {t(d, `moneyCostReport.note.${n}`, {
                  days: limits.maxDays,
                  rows: limits.maxDayRows,
                })}
              </p>
            ))}
        </form>

        <section
          className="a2-card a2-mt12"
          aria-labelledby="ar-prod"
          data-testid="ar-product"
        >
          <h2 className="a2-h3" id="ar-prod">
            {c("filter.product")}
          </h2>
          {r.product ? (
            <div className="a2-rule" data-testid="ar-product-on">
              <span>
                <b>{nameOf(r.product)}</b>
              </span>
              <span />
              <Link
                className="a2-btn"
                href={keep({ product: null, from: q.from, to: q.to })}
                data-testid="ar-product-clear"
              >
                {c("filter.clear")}
              </Link>
            </div>
          ) : null}
          <form
            className="a2-mt12"
            action={HERE}
            method="get"
            role="search"
            aria-label={c("filter.find")}
          >
            {Object.entries({
              from: q.from,
              to: q.to,
              level: r.area.level,
              category: r.area.categoryId ?? "",
            })
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="ar-find">
                {c("filter.find")}
              </label>
              <input
                id="ar-find"
                name="find"
                className="a2-inp"
                placeholder={c("filter.findPh")}
                defaultValue={findText}
                data-testid="ar-find"
              />
            </div>
            <div className="ct-actions a2-mt12">
              <button
                type="submit"
                className="a2-btn"
                data-testid="ar-find-btn"
              >
                {c("filter.findBtn")}
              </button>
            </div>
          </form>
          {findText.trim().length >= 2 && !found.length ? (
            <p className="a2-xs a2-mute a2-mt12">{c("filter.none")}</p>
          ) : null}
          {found.map((p) => (
            <div key={p.id} className="a2-rule" data-testid="ar-found">
              <span>{nameOf(p)}</span>
              <span />
              <Link
                className="a2-btn"
                href={keep({ product: p.id, from: q.from, to: q.to })}
                data-testid="ar-found-pick"
              >
                {c("filter.pick")}
              </Link>
            </div>
          ))}
        </section>

        <p className="a2-xs a2-mute a2-mt12">
          {c("period", { from: dayText(q.from), to: dayText(q.to) })}
          {r.category ? ` · ${nameOf(r.category)}` : ""}
          {r.product ? ` · ${nameOf(r.product)}` : ""}
        </p>
        <SummaryTiles
          className="a2-mt12"
          tiles={figureTiles(kpis, {
            locale: view.locale,
            money: { kind: "money", ...money },
          })}
          label={c("title")}
          testId="ar-kpi"
        />

        <section
          className="a2-card a2-mt12"
          aria-labelledby="ar-map"
          data-testid="ar-map"
        >
          <h2 className="a2-h3" id="ar-map">
            {c("map.title")}
          </h2>
          <p className="a2-cs">{c("map.sub")}</p>
          <AreaMap
            rows={s.rows}
            none={c("map.none")}
            label={(x) =>
              c("map.label", {
                name: x.parentNameEn
                  ? `${nameOf(x)}, ${bnLang && x.parentNameBn ? x.parentNameBn : x.parentNameEn}`
                  : nameOf(x),
                sales: m(x.salesMinor),
                pct: rateText(x),
              })
            }
          />
        </section>

        <section
          className="a2-card a2-mt12"
          aria-labelledby="ar-table"
          data-testid="ar-table"
        >
          <h2 className="a2-h3" id="ar-table">
            {c("table.title")}
          </h2>
          <p className="a2-cs">{c("table.sub")}</p>
          {cut ? (
            <p className="a2-xs a2-mute">
              {c("table.cut", { n: limits.maxDayRows })}
            </p>
          ) : null}
          {s.rows.length || extraRows.length ? null : (
            <p className="a2-xs a2-mute">{c("table.empty")}</p>
          )}
          {s.rows.slice(0, limits.maxDayRows).map((x) => (
            <div key={x.areaId} className="a2-rule" data-testid="ar-row">
              <span>
                <b>
                  {x.parentNameEn
                    ? `${nameOf(x)}, ${bnLang && x.parentNameBn ? x.parentNameBn : x.parentNameEn}`
                    : nameOf(x)}
                </b>
                <span className="a2-xs a2-mute cl-sub">
                  {c("table.line", {
                    n: x.delivered,
                    pieces: x.pieces,
                    ret: x.returned,
                  })}
                </span>
              </span>
              <span
                className={`a2-xs${x.returnRate !== null && x.returnRate > (s.total.returnRate ?? 1) ? " bk-warn" : " a2-mute"}`}
              >
                {rateText(x)}
              </span>
              <b>{m(x.salesMinor)}</b>
            </div>
          ))}
          {extraRows.map((x) => (
            <div key={x.key} className="a2-rule" data-testid={`ar-${x.key}`}>
              <span>
                {x.label}
                <span className="a2-xs a2-mute cl-sub">
                  {x.how}{" "}
                  {c("table.line", {
                    n: x.f.delivered,
                    pieces: x.f.pieces,
                    ret: x.f.returned,
                  })}
                </span>
              </span>
              <span className="a2-xs a2-mute">{rateText(x.f)}</span>
              <b>{m(x.f.salesMinor)}</b>
            </div>
          ))}
          {s.rows.length ? (
            <div className="a2-rule" data-testid="ar-total">
              <span>
                <b>{c("table.total")}</b>
              </span>
              <span className="a2-xs a2-mute">{rateText(s.total)}</span>
              <b>{m(s.total.salesMinor)}</b>
            </div>
          ) : null}
          <p className="a2-xs a2-mute a2-mt12">{c("how")}</p>
        </section>
      </details>
    </div>
  );
}
