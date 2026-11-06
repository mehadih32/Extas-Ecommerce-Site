// S11 · PR 238 — Website › SEO › Organic report at /admin/website/seo/organic (Blueprint C4.1 "50% of total sales from
// organic", C4.3 "track referrals from AI assistants separately", C4 build list 5): over the last `seo.organic.days`
// days, the share of Sales from organic visits against the owner's target, by search engine, video site and AI
// assistant (lib/seo/organic → @extas/metrics organicSales), and for each connected engine the clicks, times shown,
// average position and top searches (Search Console / Bing, PR 233). Seeing needs `seo.read`; the money figures also
// `reports.read` (without it the page shows order counts); the settings card saves with `seo.manage`.
// Read-only report. Guide: docs/admin-guide/pages/website/seo-organic.md.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { SEO_ORGANIC_LIMITS } from "@extas/settings";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { PageHead, SectionTabs, ShellState } from "@/components/admin/shell/ShellParts";
import { formatMoney, formatNumber, moneyOf } from "@/components/admin/products/model";
import { OrganicCard } from "@/components/admin/website/OrganicCard";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import { seoSnapshot } from "@/lib/seo/admin-api";
import { organicView, type EngineReport } from "@/lib/seo/organic";
import bn from "../../../../../../messages/admin-seo.bn.json";
import en from "../../../../../../messages/admin-seo.en.json";
import "../../../settings-cards.css";
import "../bengali/bengali.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/website/seo/organic";
const KEY = "seoOrganic";

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, seo: (view.lang === "bn" ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, "seo.og.metaTitle"), robots: { index: false, follow: false } };
}

export default async function SeoOrganicPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess("seo.read", deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === "login" || access.kind === "password") redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable" || !deps) return <AdminNotice view={view} current={KEY} text={t(d, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z" data-testid="og-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="seo.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `seo.og.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const canMoney = access.guard.permissions?.has("reports.read") ?? false;
  const canWrite = access.guard.permissions?.has("seo.manage") ?? false;
  const [snap, report, currency] = await Promise.all([seoSnapshot(deps, MOTHER_STORE_ID), organicView(deps, MOTHER_STORE_ID), deps.resolver.value("store.currency", { storeId: MOTHER_STORE_ID })]);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const pct = (v: number | null) => (v === null ? "—" : `${formatNumber(v, view.locale)}%`);
  const { sales } = report;
  const share = (part: number) => (sales.organic.salesMinor > 0 ? Math.round((part * 1000) / sales.organic.salesMinor) / 10 : null);
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: "numeric", month: "short", timeZone: "UTC", numberingSystem: "latn" }).format(new Date(`${day}T00:00:00Z`));
  const span = s("span", { from: dayText(sales.from), to: dayText(sales.to), days: num(report.days) });
  const ok = report.engines.filter((e): e is Extract<EngineReport, { status: "ok" }> => e.status === "ok");
  const clicks = ok.reduce((n, e) => n + e.data.clicks, 0);
  const rowName = (r: (typeof sales.rows)[number]) => r.name ?? s(`row.${r.kind}`);
  const notKnown = sales.rows.find((r) => r.kind === "notKnown");

  return (
    <div className="a2-z" data-testid="og-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={s("title")} sub={s("sub")} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="og-kpi-share">
          <div className="a2-kl">{s("kpi.share")}</div>
          <div className="a2-kv">{pct(sales.sharePct)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{report.targetPct > 0 ? s("kpi.target", { n: num(report.targetPct) }) : s("kpi.noTarget")}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="og-kpi-organic">
          <div className="a2-kl">{s(canMoney ? "kpi.organic" : "kpi.organicOrders")}</div>
          <div className="a2-kv">{canMoney ? m(sales.organic.salesMinor) : num(sales.organic.orders)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s("kpi.organicFoot", { n: num(sales.organic.orders), all: num(sales.all.orders) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="og-kpi-ai">
          <div className="a2-kl">{s("kpi.ai")}</div>
          <div className="a2-kv">{num(sales.kinds.ai.orders)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{canMoney ? s("kpi.aiFoot", { v: m(sales.kinds.ai.salesMinor) }) : s("kpi.aiFootOrders")}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="og-kpi-clicks">
          <div className="a2-kl">{s("kpi.clicks")}</div>
          <div className="a2-kv">{ok.length ? num(clicks) : "—"}</div>
          <div className="a2-kf">
            <span className="a2-kn">{ok.length ? s("kpi.clicksFoot", { engines: ok.map((e) => s(`engine.${e.engine}`)).join(" + ") }) : s("kpi.clicksNone")}</span>
          </div>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt12" data-testid="og-span">
        {span}
      </p>

      <section className="a2-sc a2-mt12" aria-labelledby="og-src-h">
        <h2 className="a2-h3" id="og-src-h">
          {s("sources")}
        </h2>
        {sales.rows.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="og-rows">
              <thead>
                <tr>
                  <th>{s("col.source")}</th>
                  <th>{s("col.kind")}</th>
                  <th className="r a2-num">{s("col.orders")}</th>
                  {canMoney ? <th className="r a2-num">{s("col.sales")}</th> : null}
                  {canMoney ? <th className="r a2-num">{s("col.share")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {sales.rows.map((r) => (
                  <tr key={r.key} data-key={r.key}>
                    <td>{rowName(r)}</td>
                    <td className="a2-sm a2-mute">{s(`kind.${r.kind}`)}</td>
                    <td className="r a2-num">{num(r.orders)}</td>
                    {canMoney ? <td className="r a2-num">{m(r.salesMinor)}</td> : null}
                    {canMoney ? <td className="r a2-num">{pct(share(r.salesMinor))}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="og-none">
            {s("none")}
          </p>
        )}
        {notKnown ? <p className="a2-xs a2-mute a2-mt12">{s("notKnownNote")}</p> : null}
        <p className="a2-xs a2-mute a2-mt12">{report.keepReferrals ? s("keepOn") : s("keepOff")}</p>
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="og-se-h" data-testid="og-engines">
        <h2 className="a2-h3" id="og-se-h">
          {s("results")}
        </h2>
        {report.engines.map((e) => (
          <div key={e.engine} className="a2-mt12" data-testid={`og-engine-${e.engine}`} data-status={e.status}>
            <h3 className="a2-sm" style={{ fontWeight: 600 }}>
              {s(`engine.${e.engine}`)}
            </h3>
            {e.status === "ok" ? (
              <>
                <p className="a2-sm">{s("engineLine", { clicks: num(e.data.clicks), shown: num(e.data.impressions), position: e.data.position === null ? "—" : formatNumber(e.data.position, view.locale) })}</p>
                {e.data.queries.length ? (
                  <div className="a2-tblw a2-mt12">
                    <table className="a2-tbl">
                      <thead>
                        <tr>
                          <th>{s("col.query")}</th>
                          <th className="r a2-num">{s("col.clicks")}</th>
                          <th className="r a2-num">{s("col.shown")}</th>
                          <th className="r a2-num">{s("col.position")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.data.queries.map((q) => (
                          <tr key={q.query}>
                            <td>{q.query}</td>
                            <td className="r a2-num">{num(q.clicks)}</td>
                            <td className="r a2-num">{num(q.impressions)}</td>
                            <td className="r a2-num">{q.position === null ? "—" : formatNumber(q.position, view.locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="a2-sm a2-mute">{s("noQueries")}</p>
                )}
              </>
            ) : (
              <>
                <p className="a2-sm a2-mute">{s(`status.${e.status}`)}</p>
                {e.status === "practice" ? (
                  <div className="a2-mt12">
                    <Link href="/admin/integrations" className="a2-btn">
                      {s("connect")}
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ))}
      </section>

      <div className="a2-mt12">
        <OrganicCard d={d} value={snap.values["seo.organic"]} defaults={snap.defaults["seo.organic"]} limits={SEO_ORGANIC_LIMITS} version={snap.versions["seo.organic"]} canWrite={canWrite} />
      </div>
    </div>
  );
}
