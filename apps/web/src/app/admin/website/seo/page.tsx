// S11 · PR 220–222 — Website → SEO at /admin/website/seo (docs/ADMIN-ARCHITECTURE.md §4.9 "SEO"): whether search engines
// may list the shop and which pages, the address every page names (the store's primary domain, else the preview), and
// how many Bengali pages are ready (PR 220); the search titles and descriptions of every kind of page and the AI drafts
// (PR 221). Seeing needs `seo.read` (the read-only check account has it); saving needs `seo.manage`.
// Guide: docs/admin-guide/pages/website/seo.md.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { namingTokens, SEO_PAGE_TYPES, SEO_TEMPLATE_PAGES, SEO_TEMPLATE_TOKENS } from "@extas/settings";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { IndexingCard } from "@/components/admin/website/SeoScreen";
import { AiDraftsCard, TitlesCard } from "@/components/admin/website/SeoTexts";
import { PageHead, SectionTabs, ShellState } from "@/components/admin/shell/ShellParts";
import { ShellIcon } from "@/components/admin/shell/ShellIcon";
import { formatNumber } from "@/components/admin/products/model";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import { seoSnapshot } from "@/lib/seo/admin-api";
import { draftState } from "@/lib/seo/drafts";
import bn from "../../../../../messages/admin-seo.bn.json";
import en from "../../../../../messages/admin-seo.en.json";
import "../../settings/settings.css";
import "./seo.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/website/seo";
const KEY = "seo";

/** The admin dictionary with this screen's own messages under `seo.*`. */
function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, seo: (view.lang === "bn" ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, "seo.metaTitle"), robots: { index: false, follow: false } };
}

/** The settings the titles card saves. */
const pick = (v: Awaited<ReturnType<typeof seoSnapshot>>["values"]) => ({
  "seo.titles": v["seo.titles"],
  "naming.seoTitleTemplate": v["naming.seoTitleTemplate"],
  "naming.metaDescriptionTemplate": v["naming.metaDescriptionTemplate"],
  "naming.seoTitleMaxChars": v["naming.seoTitleMaxChars"],
  "naming.metaDescriptionMaxChars": v["naming.metaDescriptionMaxChars"],
});

export default async function SeoPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess("seo.read", deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === "login" || access.kind === "password") redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable" || !deps) return <AdminNotice view={view} current={KEY} text={t(view.dict, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="seo.read" />
      </div>
    );
  const [snap, drafts] = await Promise.all([seoSnapshot(deps, MOTHER_STORE_ID), draftState(deps, MOTHER_STORE_ID)]);
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `seo.${k}`, vars);
  const canWrite = access.guard.permissions?.has("seo.manage") ?? false;
  const idx = snap.values["seo.indexing"];
  const open = idx.searchEngines && snap.site.primary !== null;

  return (
    <div className="a2-z" data-testid="seo-page">
      <PageHead view={view} place={locateKey(KEY)} title={c("title")} sub={c("sub")} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        <div className="a2-card a2-kpi" data-testid="seo-kpi-engines" data-open={open ? "1" : "0"}>
          <div className="a2-kl">{c("kpi.engines")}</div>
          <div className="a2-kv a2-sm a2-kvw">{c(open ? "kpi.open" : "kpi.closed")}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c(open ? "kpi.openSub" : "kpi.closedSub")}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="seo-kpi-address">
          <div className="a2-kl">{c("kpi.address")}</div>
          <div className="a2-kv a2-sm a2-kvw">{snap.site.primary ?? c("kpi.noPrimary")}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c(snap.site.primary ? "kpi.primarySub" : "kpi.noPrimarySub")}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c("kpi.preview")}</div>
          <div className="a2-kv a2-sm a2-kvw">{snap.site.staging ?? c("kpi.none")}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c("kpi.previewSub")}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c("kpi.bengali")}</div>
          <div className="a2-kv a2-sm a2-kvw">{snap.site.bengaliOn ? formatNumber(snap.site.bengaliReady, view.locale) : c("kpi.bengaliOff")}</div>
          <div className="a2-kf">
            <span className="a2-kn">{c("kpi.bengaliSub")}</span>
          </div>
        </div>
      </div>

      <div className="a2-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>
          <b>{c("safe.title")}</b> {c("safe.text")}
        </div>
      </div>

      <div className="a2-mt12">
        <IndexingCard d={d} value={idx} defaults={snap.defaults["seo.indexing"]} version={snap.versions["seo.indexing"]} canWrite={canWrite} pageTypes={SEO_PAGE_TYPES} />
      </div>
      <div className="a2-mt12">
        <TitlesCard
          d={d}
          value={pick(snap.values)}
          defaults={pick(snap.defaults)}
          versions={snap.versions}
          canWrite={canWrite}
          kinds={SEO_TEMPLATE_PAGES}
          tokens={{ product: namingTokens, ...SEO_TEMPLATE_TOKENS }}
        />
      </div>
      <div className="a2-mt12">
        <AiDraftsCard d={d} value={snap.values["seo.aiDrafts"]} defaults={snap.defaults["seo.aiDrafts"]} version={snap.versions["seo.aiDrafts"]} canWrite={canWrite} initial={drafts} />
      </div>
    </div>
  );
}
