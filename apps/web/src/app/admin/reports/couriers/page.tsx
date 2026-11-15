// S28 · PR 799 (CN-048; prototype v5 Reports › Couriers) — Reports › Couriers at /admin/reports/couriers: how each courier performs and what
// it costs, for 7 days, 30 days, this month or last month: a comparison table (parcels, success, returned, average days, cost per parcel,
// cash held, open claims; the best of a column in green), success week by week, the delivery charge per parcel, success by district and
// courier, and what per-area routing would have saved. It used to open the default courier's Courier 360; each courier's name still does.
// Counted from the shop's own parcels, shipments, cash collections, claims and rate cards (lib/reports-v5/couriers.ts). Read-only.
// Seeing needs `reports.read`. Words: messages/admin-reports-v5.*.json (`reportsV5.couriers.*`). Guide: docs/admin-guide/pages/reports/couriers.md.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { LineChart } from "@/components/admin/look/kit";
import { BarList } from "@/components/admin/reports/ReportCharts";
import "@/components/admin/reports/report-bar.css";
import "@/components/admin/reports/report-sort.css";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t } from "@/lib/i18n";
import {
  bestOf,
  courierStats,
  districtRows,
  inSpan,
  loadCouriers,
  routingSavings,
  weeklySuccess,
} from "@/lib/reports-v5/couriers";
import { makeFmt } from "@/lib/reports-v5/fmt";
import { loadBase } from "@/lib/reports-v5/load";
import { addDays } from "@/lib/reports-v5/model";
import { protoRange, type ProtoPeriod } from "@/lib/reports-v5/period";
import { practiceScope } from "@/lib/reports-v5/practice";
import { withReportsV5 } from "@/lib/reports-v5/words";
import "../../settings-cards.css";
import "../../money/money.css";
import "../delivery/report.css";

export const dynamic = "force-dynamic";

const KEY = "reportsCouriers";
const HERE = "/admin/reports/couriers";
/** The four periods of the prototype's Couriers report. */
const CHIPS = [
  "d7",
  "d30",
  "month",
  "lastMonth",
] as const satisfies readonly Exclude<ProtoPeriod, "custom" | "today" | "m6">[];
const PALETTE = [
  "var(--a3-c1)",
  "var(--a3-s2)",
  "var(--a3-s3)",
  "var(--a3-s4)",
  "var(--a3-s5)",
];

export async function generateMetadata(): Promise<Metadata> {
  const view = withReportsV5(await adminView());
  return {
    title: `${t(view.dict, "reportsV5.couriers.metaTitle")} · ${t(view.dict, "shell.admin")}`,
    robots: { index: false, follow: false },
  };
}

export default async function CouriersReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([
    adminView(deps),
    pageAccess("reports.read", deps, MOTHER_STORE_ID),
    searchParams,
  ]);
  const view = withReportsV5(plain);
  const d = view.dict;
  if (access.kind === "login" || access.kind === "password")
    redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable")
    return <AdminNotice view={view} current={KEY} text={t(d, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z lm-rp" data-testid="rp-couriers" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.couriers.${k}`, v);
  const cc = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.common.${k}`, v);
  const base = await loadBase(access.deps, sp);
  const { q } = base.period;
  const key = (CHIPS as readonly string[]).includes(String(sp.p))
    ? (sp.p as (typeof CHIPS)[number])
    : "d30";
  const span = (CHIPS as readonly string[]).includes(String(sp.p))
    ? protoRange(key, base.today)
    : { from: q.from, to: q.to };
  const data = await loadCouriers(
    access.deps.db,
    base.timeZone,
    span.from,
    span.to,
    base.today,
    await practiceScope(access.deps),
  );
  const f = makeFmt(view.locale, base.currency);
  const rows = inSpan(data.rows, span.from, span.to, base.timeZone);
  const stats = courierStats(
    data.couriers,
    rows,
    data.charge,
    data.held,
    data.claims,
    data.fees,
  );
  const best = {
    success: bestOf(stats, "success"),
    returnPct: bestOf(stats, "returnPct"),
    avgDays: bestOf(stats, "avgDays"),
    perParcel: bestOf(stats, "perParcel"),
  };
  const hl = (v: number | null, b: number | null) =>
    v !== null && v === b && stats.length > 1 ? "rp-hl" : undefined;
  const pc = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
  const weeks = weeklySuccess(data.couriers, data.rows, span.to);
  const dist = districtRows(data.couriers, rows);
  const monthStart = `${base.today.slice(0, 8)}01`;
  const lastEnd = addDays(monthStart, -1);
  const lastStart = `${lastEnd.slice(0, 8)}01`;
  const thisRoute = routingSavings(
    inSpan(data.rows, monthStart, base.today, base.timeZone),
    data.charge,
    data.cheapest,
  );
  const lastRoute = routingSavings(
    inSpan(data.rows, lastStart, lastEnd, base.timeZone),
    data.charge,
    data.cheapest,
  );
  const bn = view.lang === "bn";
  const href = (k: (typeof CHIPS)[number]) => {
    const r = protoRange(k, base.today);
    return `${HERE}?p=${k}&from=${r.from}&to=${r.to}`;
  };
  const csv = `/api/admin/reports/export/couriers?from=${span.from}&to=${span.to}`;
  const num = (x: number) => f.num(x);

  return (
    <div
      className="a2-z lm-rp"
      data-testid="rp-couriers"
      data-lm-ready=""
      data-from={span.from}
      data-to={span.to}
    >
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={cc("pageTitle")}
        sub={c("sub")}
      />
      <SectionTabs view={view} current={KEY} />
      <div className="rpbar-top a2-mt12" data-testid="rp-courier-bar">
        <nav
          className="rpseg"
          aria-label={cc("periodsLabel")}
          data-testid="rp-courier-chips"
        >
          {CHIPS.map((k) => (
            <Link
              key={k}
              href={href(k)}
              className={key === k ? "on" : ""}
              aria-current={key === k ? "true" : undefined}
              data-testid={`rp-courier-chip-${k}`}
            >
              {cc(`p.${k}`)}
            </Link>
          ))}
        </nav>
        <span className="rpbar-grow" />
        <a
          className="a2-btn sm cr-tap"
          href={csv}
          download
          data-testid="rp-courier-download"
        >
          ↓ {c("download")}
        </a>
      </div>

      <section
        className="a2-card a2-mt12"
        aria-labelledby="rp-cmp"
        data-testid="rp-courier-compare"
      >
        <h2 className="a2-h3" id="rp-cmp">
          {c("compTitle")}
        </h2>
        <p className="a2-cs">{c("compSub")}</p>
        {stats.length ? (
          <div className="rp-frame">
            <table className="rp-tbl">
              <thead>
                <tr>
                  <th>{c("colCourier")}</th>
                  <th className="r">{c("colParcels")}</th>
                  <th className="r">{c("colSuccess")}</th>
                  <th className="r hide-sm">{c("colReturned")}</th>
                  <th className="r">{c("colDays")}</th>
                  <th className="r hide-sm">{c("colCost")}</th>
                  <th className="r hide-sm">{c("colHeld")}</th>
                  <th className="r hide-sm">{c("colClaims")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.id} data-testid="rp-courier-row">
                    <td>
                      <Link
                        className="a2-lnk cr-link"
                        href={`/admin/delivery/couriers/${s.id}`}
                      >
                        <b>{s.name}</b>
                      </Link>
                    </td>
                    <td className="r">{num(s.parcels)}</td>
                    <td className="r">
                      <span className={hl(s.success, best.success)}>
                        {pc(s.success)}
                      </span>
                    </td>
                    <td className="r hide-sm">
                      <span className={hl(s.returnPct, best.returnPct)}>
                        {pc(s.returnPct)}
                      </span>
                    </td>
                    <td className="r">
                      <span className={hl(s.avgDays, best.avgDays)}>
                        {s.avgDays === null
                          ? "—"
                          : String(Math.round(s.avgDays * 10) / 10)}
                      </span>
                    </td>
                    <td className="r hide-sm">
                      <span className={hl(s.perParcel, best.perParcel)}>
                        {s.perParcel === null ? "—" : f.amount(s.perParcel)}
                      </span>
                    </td>
                    <td className="r hide-sm">{f.amount(s.held)}</td>
                    <td className="r hide-sm">{num(s.openClaims)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute" data-testid="rp-courier-compare-empty">
            {c("noCouriers")}
          </p>
        )}
      </section>

      <div className="rp-grid2 a2-mt12">
        <section
          className="a2-card"
          aria-labelledby="rp-wk"
          data-testid="rp-courier-weeks"
        >
          <h2 className="a2-h3" id="rp-wk">
            {c("weekTitle")}
          </h2>
          <p className="a2-cs">{c("weekSub")}</p>
          {weeks.series.length ? (
            <LineChart
              id="rp-courier-trend"
              labels={weeks.labels.map((x) => f.dayShort(x))}
              series={weeks.series.map((s, i) => ({
                v: s.values,
                color: PALETTE[i % PALETTE.length]!,
                name: s.name,
                shown: s.values.map((v) => `${v}%`),
              }))}
              h={210}
              label={c("weekTitle")}
              yfmt={(v) => `${Math.round(v)}%`}
            />
          ) : (
            <p className="a2-sm a2-mute">{cc("none")}</p>
          )}
        </section>
        <section
          className="a2-card"
          aria-labelledby="rp-cost"
          data-testid="rp-courier-cost"
        >
          <h2 className="a2-h3" id="rp-cost">
            {c("costTitle")}
          </h2>
          <p className="a2-cs">{c("costSub")}</p>
          {stats.length ? (
            <>
              <BarList
                testId="rp-courier-cost-bars"
                items={stats.map((s) => ({
                  key: s.id,
                  label: s.name,
                  value: s.perParcel ?? 0,
                  shown: s.perParcel === null ? "—" : f.amount(s.perParcel),
                }))}
              />
              <ul
                className="a2-xs a2-mute a2-mt12"
                data-testid="rp-courier-cost-parts"
              >
                {stats
                  .filter((s) => s.perParcel !== null)
                  .map((s) => (
                    <li key={s.id}>
                      {c("costParts", {
                        name: s.name,
                        delivery: f.amount(s.delivery),
                        cod: f.amount(s.codFee),
                        ret: f.amount(s.returnCharges),
                      })}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="a2-sm a2-mute">{cc("none")}</p>
          )}
        </section>
      </div>

      <section
        className="a2-card a2-mt12"
        aria-labelledby="rp-dist"
        data-testid="rp-courier-districts"
      >
        <h2 className="a2-h3" id="rp-dist">
          {c("districtTitle")}
        </h2>
        <p className="a2-cs">{c("districtSub")}</p>
        {dist.length ? (
          <div className="rp-frame">
            <table className="rp-tbl">
              <thead>
                <tr>
                  <th>{c("colDistrict")}</th>
                  <th className="r">{c("colParcels")}</th>
                  {data.couriers.map((x) => (
                    <th key={x.id} className="r">
                      {x.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dist.map((r) => {
                  const top = Math.max(
                    ...data.couriers.map((x) => r.by.get(x.id)?.success ?? -1),
                  );
                  return (
                    <tr key={r.district} data-testid="rp-courier-district-row">
                      <td>{r.district}</td>
                      <td className="r">{num(r.n)}</td>
                      {data.couriers.map((x) => {
                        const v = r.by.get(x.id);
                        return (
                          <td key={x.id} className="r">
                            {v && v.n ? (
                              <>
                                <span
                                  className={
                                    v.success !== null &&
                                    v.success === top &&
                                    data.couriers.length > 1
                                      ? "rp-hl"
                                      : undefined
                                  }
                                >
                                  {pc(v.success)}
                                </span>
                                <span className="a2-xs a2-mute a2-blk">
                                  {num(v.n)}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute">{cc("none")}</p>
        )}
      </section>

      <section
        className="a2-card a2-mt12"
        aria-labelledby="rp-route"
        data-testid="rp-courier-routing"
      >
        <h2 className="a2-h3" id="rp-route">
          {c("routeTitle")}
        </h2>
        <p className="a2-cs">{c("routeSub")}</p>
        <div className="rp-kchips" data-testid="rp-courier-routing-chips">
          <div>
            <span>{c("routeThis")}</span>
            <b>{f.amount(thisRoute.total)}</b>
          </div>
          <div>
            <span>{c("routeLast")}</span>
            <b>{f.amount(lastRoute.total)}</b>
          </div>
        </div>
        {thisRoute.rows.length ? (
          <div className="rp-frame a2-mt12">
            <table className="rp-tbl">
              <thead>
                <tr>
                  <th>{c("colArea")}</th>
                  <th>{c("colCheapest")}</th>
                  <th className="r">{c("colMonthParcels")}</th>
                  <th className="r">{c("colSave")}</th>
                </tr>
              </thead>
              <tbody>
                {thisRoute.rows.map((r) => (
                  <tr key={r.zone} data-testid="rp-courier-route-row">
                    <td>{bn && r.bn ? r.bn : r.en}</td>
                    <td>
                      {r.best} · {f.amount(r.fee)}
                    </td>
                    <td className="r">{num(r.parcels)}</td>
                    <td className="r">
                      <b>{f.amount(r.save)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{c("noRates")}</p>
        )}
        <p className="a2-xs a2-mute a2-mt6">{c("routeNote")}</p>
      </section>
    </div>
  );
}
