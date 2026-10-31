// S11 · PR 220–222 — Website → SEO at /admin/website/seo (docs/ADMIN-ARCHITECTURE.md §4.9 "SEO"): whether search engines
// may list the shop and which pages, the address every page names (the store's primary domain, else the preview), and
// how many Bengali pages are ready (PR 220); the search titles and descriptions of every kind of page and the AI drafts
// (PR 221); which data for search engines (structured data) the pages carry (PR 222); the pages that stay when a
// product or collection cannot be bought (PR 527, "Pages that stay"); the sitemaps (PR 228); robots.txt and the AI
// robots (PR 229); the photo descriptions (PR 232); Search Console and Bing (PR 233); real visitors' speed (PR 234).
// Seeing needs `seo.read` (the
// read-only check account has it); saving needs `seo.manage`.
// Guide: docs/admin-guide/pages/website/seo.md.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { namingTokens, SEO_ALT_TEXT_LIMITS, SEO_VERIFICATION_LIMITS, SEO_VITALS_LIMITS, SEO_PAGE_TYPES, SEO_ROBOTS_LIMITS, SEO_SITEMAP_LIMITS, SEO_TEMPLATE_PAGES, SEO_TEMPLATE_TOKENS } from "@extas/settings";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { IndexingCard, StructuredDataCard } from "@/components/admin/website/SeoScreen";
import { AiDraftsCard, TitlesCard } from "@/components/admin/website/SeoTexts";
import { UrlPolicyCard } from "@/components/admin/website/UrlPolicyCard";
import { SitemapsCard } from "@/components/admin/website/SitemapsCard";
import { RobotsCard } from "@/components/admin/website/RobotsCard";
import { AltTextCard } from "@/components/admin/website/AltTextCard";
import { SearchEnginesCard } from "@/components/admin/website/SearchEnginesCard";
import { VitalsCard } from "@/components/admin/website/VitalsCard";
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
import { sitemapsState } from "@/lib/seo/sitemap-admin";
import { robotsTxt } from "@/lib/seo/robots";
import { altTextFor } from "@/lib/seo/alt-text";
import { missingAlt } from "@/lib/seo/alt-text-data";
import { searchEngineState } from "@/lib/seo/search-engines";
import { SITEMAP_INDEX } from "@/lib/seo/sitemap";
import { labReport, vitalsReport } from "@/lib/seo/vitals-data";
import { shopContextFor } from "@/lib/shop/context";
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
  const [snap, drafts, sitemaps, altMissing, shopEn, engines] = await Promise.all([seoSnapshot(deps, MOTHER_STORE_ID), draftState(deps, MOTHER_STORE_ID), sitemapsState(MOTHER_STORE_ID), missingAlt(deps.db, MOTHER_STORE_ID), shopContextFor(MOTHER_STORE_ID, "en"), searchEngineState(deps.db)]);
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `seo.${k}`, vars);
  const canWrite = access.guard.permissions?.has("seo.manage") ?? false;
  const idx = snap.values["seo.indexing"];
  const open = idx.searchEngines && snap.site.primary !== null;
  // PR 229: what /robots.txt answers on the shop's own domain
  const robots = robotsTxt(snap.values["seo.robots"], { open, searchListed: idx.pages.search, sitemap: snap.values["seo.sitemaps"].enabled ? sitemaps.index : null });
  // PR 232: a description as the shop writes it, in the shop's English words (always English: that one goes live)
  // PR 234: real visitors' speed and the newest monthly lab run
  const [vReport, vLab] = await Promise.all([vitalsReport(deps.db, MOTHER_STORE_ID, snap.values["seo.vitals"]), labReport(deps.db, MOTHER_STORE_ID, snap.values["seo.vitals"])]);
  // PR 233: the shop's own address (the store's primary domain) is what Search Console and Bing verify
  const primarySite = snap.site.primary ? `https://${snap.site.primary}/` : null;
  const primarySitemap = snap.site.primary ? new URL(SITEMAP_INDEX, `https://${snap.site.primary}`).toString() : null;
  const altExample = altTextFor({ name: en.at.sampleName, colour: en.at.sampleColour, role: "FRONT" }, (k, v) => shopEn.t(k, v), snap.values["seo.altText"].maxLength) ?? "";

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
        <StructuredDataCard d={d} value={snap.values["seo.structuredData"]} defaults={snap.defaults["seo.structuredData"]} version={snap.versions["seo.structuredData"]} canWrite={canWrite} />
      </div>
      <div className="a2-mt12">
        <UrlPolicyCard d={d} value={snap.values["seo.urlPolicy"]} defaults={snap.defaults["seo.urlPolicy"]} version={snap.versions["seo.urlPolicy"]} canWrite={canWrite} />
      </div>
      <div className="a2-mt12">
        <SitemapsCard
          d={d}
          value={snap.values["seo.sitemaps"]}
          defaults={snap.defaults["seo.sitemaps"]}
          limits={SEO_SITEMAP_LIMITS}
          version={snap.versions["seo.sitemaps"]}
          canWrite={canWrite}
          initial={sitemaps}
          locale={view.locale}
          timeZone={view.timeZone}
        />
      </div>
      <div className="a2-mt12">
        <RobotsCard d={d} value={snap.values["seo.robots"]} defaults={snap.defaults["seo.robots"]} limits={SEO_ROBOTS_LIMITS} version={snap.versions["seo.robots"]} canWrite={canWrite} preview={robots} />
      </div>
      <div className="a2-mt12">
        <VitalsCard d={d} value={snap.values["seo.vitals"]} defaults={snap.defaults["seo.vitals"]} limits={SEO_VITALS_LIMITS} version={snap.versions["seo.vitals"]} canWrite={canWrite} report={vReport} lab={vLab} locale={view.locale} timeZone={view.timeZone} />
      </div>
      <div className="a2-mt12">
        <SearchEnginesCard d={d} value={snap.values["seo.verification"]} limits={SEO_VERIFICATION_LIMITS} version={snap.versions["seo.verification"]} canWrite={canWrite} engines={engines} site={primarySite} sitemap={primarySitemap} />
      </div>
      <div className="a2-mt12">
        <AltTextCard d={d} value={snap.values["seo.altText"]} defaults={snap.defaults["seo.altText"]} limits={SEO_ALT_TEXT_LIMITS} version={snap.versions["seo.altText"]} canWrite={canWrite} missing={altMissing} example={altExample} locale={view.locale} />
      </div>
      <div className="a2-mt12">
        <AiDraftsCard d={d} value={snap.values["seo.aiDrafts"]} defaults={snap.defaults["seo.aiDrafts"]} version={snap.versions["seo.aiDrafts"]} canWrite={canWrite} initial={drafts} />
      </div>
    </div>
  );
}
