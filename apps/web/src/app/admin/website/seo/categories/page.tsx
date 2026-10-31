// S11 · PR 227 — Website › SEO › Collection pages at /admin/website/seo/categories (Blueprint C12.1, App. answers #7):
// a collection's or sub-collection's own words for search engines (`category.seo`: the search title, the search line,
// the heading and the text under its grid, in both languages) and the few filtered pages that may be listed
// (`seo.filterPages`: one size, colour or fit on one collection, with its own name, only while it shows enough styles;
// every other combination points to the clean collection page). Seeing needs `seo.read`; saving needs `seo.manage`.
// Guide: docs/admin-guide/pages/website/seo-categories.md.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { CATEGORY_SEO_MAX, SEO_FILTER_LIMITS } from "@extas/settings";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { CategoryTextsCard, FilterPagesCard, type CatOption, type CategorySeoValue, type FilterPagesValue } from "@/components/admin/website/CategorySeoCards";
import { PageHead, SectionTabs, ShellState } from "@/components/admin/shell/ShellParts";
import { ShellIcon } from "@/components/admin/shell/ShellIcon";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import { seoSnapshot } from "@/lib/seo/admin-api";
import bn from "../../../../../../messages/admin-seo.bn.json";
import en from "../../../../../../messages/admin-seo.en.json";
import "../../../settings/settings.css";
import "../seo.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/website/seo/categories";
const KEY = "seoCategories";

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, seo: (view.lang === "bn" ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, "seo.cs.metaTitle"), robots: { index: false, follow: false } };
}

export default async function CategorySeoPage() {
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
  const [snap, rows] = await Promise.all([
    seoSnapshot(deps, MOTHER_STORE_ID),
    deps.db.category.findMany({ where: { storeId: MOTHER_STORE_ID, archivedAt: null }, select: { id: true, slug: true, nameEn: true, nameBn: true, parentId: true }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
  ]);
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `seo.cs.${k}`, vars);
  const nameOf = (r: (typeof rows)[number]) => (view.lang === "bn" && r.nameBn ? r.nameBn : r.nameEn);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // a collection first, then its sub-collections under it
  const cats: CatOption[] = rows
    .filter((r) => !r.parentId || !byId.has(r.parentId))
    .flatMap((top) => [top, ...rows.filter((r) => r.parentId === top.id)])
    .map((r) => {
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      return { slug: r.slug, name: nameOf(r), parent: parent ? nameOf(parent) : null };
    });
  const canWrite = access.guard.permissions?.has("seo.manage") ?? false;
  const fp = snap.values["seo.filterPages"] as FilterPagesValue;

  return (
    <div className="a2-z" data-testid="cs-page">
      <PageHead view={view} place={locateKey(KEY)} title={c("title")} sub={c("sub")} />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>
          <b>{c("rule.title")}</b> {c("rule.text")}
        </div>
      </div>

      <div className="a2-row a2-r21 a2-mt12">
        <div className="a2-stack">
          {/* not keyed by version: a save keeps the collection being edited on screen */}
          <CategoryTextsCard d={d} cats={cats} value={snap.values["category.seo"] as CategorySeoValue} version={snap.versions["category.seo"]} canWrite={canWrite} max={CATEGORY_SEO_MAX} />
        </div>
        <div className="a2-stack">
          <FilterPagesCard key={`f-${snap.versions["seo.filterPages"]}`} d={d} cats={cats} value={fp} defaults={snap.defaults["seo.filterPages"] as FilterPagesValue} version={snap.versions["seo.filterPages"]} canWrite={canWrite} limits={SEO_FILTER_LIMITS} />
        </div>
      </div>
    </div>
  );
}
