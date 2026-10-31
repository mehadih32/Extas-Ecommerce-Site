// S11 · PR 235 — Website › SEO › Redirects & 404 at /admin/website/seo/redirects (demo WEB-04a,
// docs/ADMIN-ARCHITECTURE.md §4.9 "redirects and 404s"): the old links that forward (renamed products and categories,
// links typed in by hand, combos asked for with their colours in another order, the WordPress map), with their hits and
// an on/off each; the 404 report with a suggested page and the one-click fix; the import of the owner's list of old
// links (checked line by line first) and the WordPress map's switch for go-live day. Seeing needs `seo.read`; every
// change needs `seo.manage`. Guide: docs/admin-guide/pages/website/redirects.md.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { AddRedirect, ImportCard, NotFoundActions, RedirectOptions, RedirectToggle, WordpressCard } from "@/components/admin/website/RedirectsScreen";
import { SeoCard } from "@/components/admin/website/SeoScreen";
import { PageHead, SectionTabs, ShellState } from "@/components/admin/shell/ShellParts";
import { ShellIcon } from "@/components/admin/shell/ShellIcon";
import { formatNumber } from "@/components/admin/products/model";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import { REDIRECT_VIEWS, redirectsSnapshot, type RedirectView } from "@/lib/seo/redirects-admin";
import bn from "../../../../../../messages/admin-seo.bn.json";
import en from "../../../../../../messages/admin-seo.en.json";
import "../../../settings/settings.css";
import "../seo.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/website/seo/redirects";
const KEY = "seoRedirects";

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, seo: (view.lang === "bn" ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, "seo.rd.metaTitle"), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ view?: string; q?: string }> };

const hrefOf = (view: RedirectView, q: string) => {
  const p = new URLSearchParams();
  if (view !== "all") p.set("view", view);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `${HERE}?${s}` : HERE;
};

export default async function RedirectsPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess("seo.read", deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  if (access.kind === "login" || access.kind === "password") redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable" || !deps) return <AdminNotice view={view} current={KEY} text={t(view.dict, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="seo.read" />
      </div>
    );
  const snap = await redirectsSnapshot(deps, MOTHER_STORE_ID, { view: sp.view, q: sp.q });
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `seo.rd.${k}`, vars);
  const n = (x: number) => formatNumber(x, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: "latn", dateStyle: "medium" });
  const day = (iso: string | null) => (iso ? when.format(new Date(iso)) : "—");
  const canWrite = access.guard.permissions?.has("seo.manage") ?? false;
  const nf = snap.notFound;

  return (
    <div className="a2-z" data-testid="rd-page">
      <PageHead view={view} place={locateKey(KEY)} title={c("title")} sub={c("sub")} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="rd-kpi-on">
          <div className="a2-kl">{c("kpi.on")}</div>
          <div className="a2-kv">{n(snap.counts.all - snap.counts.off)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c("kpi.onSub", { off: n(snap.counts.off) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="rd-kpi-wp" data-live={snap.wordpress.live ? "1" : "0"}>
          <div className="a2-kl">{c("kpi.wp")}</div>
          <div className="a2-kv">{n(snap.wordpress.rows)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c(snap.wordpress.live ? "kpi.wpLive" : "kpi.wpWaiting")}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="rd-kpi-404">
          <div className="a2-kl">{c("kpi.nf")}</div>
          <div className="a2-kv">{n(nf.openCount)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c("kpi.nfSub", { fixed: n(nf.fixedCount), ignored: n(nf.ignoredCount) })}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c("kpi.code")}</div>
          <div className="a2-kv">{snap.statusCode}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c("kpi.codeSub")}</span>
          </div>
        </div>
      </div>

      <div className="a2-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>
          <b>{c("safe.title")}</b> {c("safe.text")}
        </div>
      </div>

      <div className="a2-row a2-r21 a2-mt12">
        <div className="a2-stack">
          <SeoCard id="a2s-rdlist" testId="rd-list" where={c("where")} title={c("list.title")} desc={c("list.desc")}>
            <nav className="a2-views" aria-label={c("list.viewsAria")} data-testid="rd-views">
              {REDIRECT_VIEWS.map((v) => {
                const on = v === snap.view;
                return (
                  <Link key={v} className={`a2-view${on ? " on" : ""}`} href={hrefOf(v, snap.q)} aria-current={on ? "page" : undefined} scroll={false} data-view={v}>
                    {c(`view.${v}`)}
                    <span className="a2-cnt">{n(snap.counts[v])}</span>
                  </Link>
                );
              })}
            </nav>
            <form className="a2-gap8 a2-mt12" role="search" action={HERE} method="get" aria-label={c("list.searchAria")}>
              {snap.view !== "all" ? <input type="hidden" name="view" value={snap.view} /> : null}
              <label className="a2-sr" htmlFor="rd-q">
                {c("list.search")}
              </label>
              <input id="rd-q" name="q" className="a2-inp" defaultValue={snap.q} placeholder={c("list.search")} autoComplete="off" data-testid="rd-q" />
              <button className="a2-btn">{c("list.go")}</button>
            </form>
            {snap.redirects.length ? (
              <div className="a2-tblw a2-mt12">
                <table className="a2-tbl" data-testid="rd-rows">
                  <thead>
                    <tr>
                      <th>{c("col.from")}</th>
                      <th>{c("col.to")}</th>
                      <th>{c("col.kind")}</th>
                      <th className="r">{c("col.hits")}</th>
                      <th>{c("col.on")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.redirects.map((row) => (
                      <tr key={row.id} data-testid="rd-row" data-kind={row.kind} data-on={row.enabled ? "1" : "0"}>
                        <td className="a2-tdh">
                          <span className="a2-mono a2-sm">{row.fromPath}</span>
                          {row.keepUntil ? <span className="a2-xs a2-mute a2-blk">{c("col.keepUntil", { d: day(row.keepUntil) })}</span> : null}
                        </td>
                        <td data-l={c("col.to")}>
                          <span className="a2-mono a2-sm">{row.toPath}</span>
                        </td>
                        <td data-l={c("col.kind")}>
                          <span className="a2-pill">{c(`kind.${row.kind}`)}</span>
                        </td>
                        <td className="r" data-l={c("col.hits")}>
                          <span className="a2-num">{n(row.hits)}</span>
                          {row.lastHitAt ? <span className="a2-xs a2-mute a2-blk">{day(row.lastHitAt)}</span> : null}
                        </td>
                        <td data-l={c("col.on")}>
                          <RedirectToggle d={d} id={row.id} enabled={row.enabled} canWrite={canWrite} label={row.fromPath} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="a2-state" data-testid="rd-empty">
                <div className="a2-sti">
                  <ShellIcon name={snap.q ? "search" : "ext"} size={26} />
                </div>
                <h3>{c(snap.q ? "list.emptySearch" : "list.empty")}</h3>
                <p>{c("list.emptyBody")}</p>
              </div>
            )}
            {snap.redirects.length >= snap.values["seo.redirects"].listShown ? <p className="a2-xs a2-mute a2-mt6">{c("list.more", { n: n(snap.values["seo.redirects"].listShown) })}</p> : null}
          </SeoCard>
          <AddRedirect d={d} canWrite={canWrite} />
          <ImportCard d={d} canWrite={canWrite} keepMonths={snap.values["seo.redirects"].keepMonths} />
        </div>
        <div className="a2-stack">
          <SeoCard id="a2s-rd404" testId="rd-404" where={c("where")} title={c("nf.title")} desc={c("nf.desc")}>
            {nf.open.length ? (
              <ul className="seo-drafts">
                {nf.open.map((h) => (
                  <li key={h.id} className="a2-card seo-draft" data-testid="nf-row">
                    <b className="a2-mono">{h.path}</b>
                    <span className="a2-xs a2-mute a2-blk">
                      {c("nf.seen", { n: n(h.hits), d: day(h.lastSeenAt) })}
                      {h.referrer ? ` · ${c("nf.from", { r: h.referrer })}` : ""}
                    </span>
                    {h.suggestion ? (
                      <span className="a2-xs a2-blk" data-testid="nf-suggestion">
                        {c("nf.suggest", { label: h.suggestion.label, path: h.suggestion.path, pct: h.suggestion.percent })}
                      </span>
                    ) : (
                      <span className="a2-xs a2-mute a2-blk">{c("nf.noSuggest")}</span>
                    )}
                    <NotFoundActions d={d} id={h.id} path={h.path} suggestion={h.suggestion?.path ?? null} canWrite={canWrite} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute" data-testid="nf-empty">
                {c(snap.values["seo.notFound"].record ? "nf.empty" : "nf.off")}
              </p>
            )}
          </SeoCard>
          <WordpressCard key={`wp-${snap.values["seo.redirects"].keepMonths}-${snap.values["seo.redirects"].listShown}`} d={d} value={snap.values["seo.redirects"]} version={snap.versions["seo.redirects"]} canWrite={canWrite} rows={snap.wordpress.rows} />
          <RedirectOptions key={`opt-${snap.versions["seo.redirects"]}-${snap.versions["seo.notFound"]}`} d={d} values={snap.values} versions={snap.versions} defaults={snap.defaults} canWrite={canWrite} />
        </div>
      </div>
    </div>
  );
}
