// S11 · PR 237 — Website › SEO › SEO health at /admin/website/seo/health: what is missing, page by page (lib/seo/health):
// a published product with no description, no photo or photos without a description; a shown collection with no text
// under its grid, no search line or no style. Counts per issue on top (each a filter), the pages below with where each
// is fixed, and the Bengali coverage with a link to Bengali pages. Read-only; seeing needs `seo.read`.
// Every deploy's smoke test checks the built pages themselves (tools/hreflang-check.mjs: the language pairs, the
// canonical in the page's own language, no "#" links). Guide: docs/admin-guide/pages/website/seo-health.md.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { PageHead, SectionTabs, ShellState } from "@/components/admin/shell/ShellParts";
import { formatNumber } from "@/components/admin/products/model";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import { seoSnapshot } from "@/lib/seo/admin-api";
import { HEALTH_ISSUES, healthCounts, seoHealth, type HealthIssue } from "@/lib/seo/health";
import { shopContextFor } from "@/lib/shop/context";
import bn from "../../../../../../messages/admin-seo.bn.json";
import en from "../../../../../../messages/admin-seo.en.json";
import "../../../settings-cards.css";
import "../bengali/bengali.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/website/seo/health";
const KEY = "seoHealth";
/** The most rows drawn at once; a filter narrows the rest. */
const SHOWN = 200;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, seo: (view.lang === "bn" ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, "seo.sh.metaTitle"), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ issue?: string }> };

export default async function SeoHealthPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess("seo.read", deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === "login" || access.kind === "password") redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable" || !deps) return <AdminNotice view={view} current={KEY} text={t(d, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z" data-testid="hl-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="seo.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `seo.sh.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const [snap, shop] = await Promise.all([seoSnapshot(deps, MOTHER_STORE_ID), shopContextFor(MOTHER_STORE_ID, "en")]);
  const health = await seoHealth(deps.db, MOTHER_STORE_ID, snap.values["category.seo"], shop.s["naming.productPathPrefix"]);
  const counts = healthCounts(health.rows);
  const issue = HEALTH_ISSUES.find((i) => i === sp.issue) ?? null;
  const rows = issue ? health.rows.filter((r) => r.issues.includes(issue)) : health.rows;
  const shown = rows.slice(0, SHOWN);
  const hidden = rows.length - shown.length;
  const said = (i: HealthIssue, n: number) => (i === "photoNoAlt" ? s(`issue.${i}`, { n: num(n) }) : s(`issue.${i}`));

  return (
    <div className="a2-z" data-testid="hl-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={s("title")} sub={s("sub")} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis a2-mt12">
        <div className="a2-card a2-kpi" data-testid="hl-kpi-pages">
          <div className="a2-kl">{s("kpi.pages")}</div>
          <div className="a2-kv">{num(health.rows.length)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s("kpi.pagesFoot", { products: num(health.products), collections: num(health.collections) })}</span>
          </div>
        </div>
        <Link className="a2-card a2-kpi" href="/admin/website/seo/bengali" data-testid="hl-kpi-bengali">
          <div className="a2-kl">{s("kpi.bengali")}</div>
          <div className="a2-kv">{s("kpi.bengaliOpen")}</div>
          <div className="a2-kf">
            <span className="a2-kn">{s("kpi.bengaliFoot")}</span>
          </div>
        </Link>
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="hl-list-h">
        <h2 className="a2-h3" id="hl-list-h">
          {s("list")}
        </h2>
        <nav className="a2-views bg-views" aria-label={s("list")} data-testid="hl-issues">
          <Link className={`a2-view${issue === null ? " on" : ""}`} href={HERE} aria-current={issue === null ? "page" : undefined}>
            {s("all", { n: num(health.rows.length) })}
          </Link>
          {HEALTH_ISSUES.map((i) => (
            <Link key={i} className={`a2-view${issue === i ? " on" : ""}`} href={`${HERE}?issue=${i}`} aria-current={issue === i ? "page" : undefined} data-testid={`hl-issue-${i}`}>
              {s(`filter.${i}`, { n: num(counts[i]) })}
            </Link>
          ))}
        </nav>
        {shown.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="hl-rows">
              <thead>
                <tr>
                  <th>{s("col.page")}</th>
                  <th>{s("col.missing")}</th>
                  <th>{s("col.fix")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} data-key={r.key}>
                    <td className="bg-name">
                      <div className="a2-xs a2-mute">{s(`kind.${r.kind}`)}</div>
                      <div>{r.name}</div>
                      <div className="a2-sm a2-mute bg-path">{r.path}</div>
                    </td>
                    <td className="a2-sm">
                      {r.issues.map((i) => (
                        <span key={i} className="a2-pill warn" style={{ marginRight: 6, marginBottom: 4, display: "inline-flex" }}>
                          {said(i, r.photosNoAlt)}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Link className="a2-btn" href={r.fix}>
                        {s("fix")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="hl-none">
            {s(issue ? "noneHere" : "none")}
          </p>
        )}
        {hidden ? (
          <p className="a2-sm a2-mute a2-mt12">{s("more", { n: num(hidden) })}</p>
        ) : null}
        <p className="a2-xs a2-mute a2-mt12">{s("deploy")}</p>
      </section>
    </div>
  );
}
