// S29 · PR 753 (CN-054) — Reports › Geography map at /admin/reports/geo-map: a map of Bangladesh coloured by orders, sales,
// delivered, returned or return rate, with the drill-down district → upazila → areas of Dhaka City. Seeing needs
// `reports.read` (Sales only with `books.read`). No on/off switch (owner's decision, 16 Nov 2026).
// The figures are the routes of PR 752; the screen is components/admin/reports/geo-map/GeoMapScreen. Words: messages/admin-geo-map.*.json.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MOTHER_STORE_ID } from "@extas/db/client";
import type { GeoMapSetting } from "@extas/metrics/geo-types";
import { AdminNotice } from "@/components/admin/AdminFrame";
import {
  GeoMapScreen,
  type GeoMapWords,
} from "@/components/admin/reports/geo-map/GeoMapScreen";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import bn from "../../../../../messages/admin-geo-map.bn.json";
import en from "../../../../../messages/admin-geo-map.en.json";
import "../../settings-cards.css";

export const dynamic = "force-dynamic";

const KEY = "reportsGeoMap";
const HERE = "/admin/reports/geo-map";

function withScreen(view: AdminView): AdminView {
  const b = view.lang === "bn";
  return { ...view, dict: { ...view.dict, reportsGeoMap: (b ? bn : en).reportsGeoMap as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, "reportsGeoMap.metaTitle")} · ${t(view.dict, "shell.admin")}`, robots: { index: false, follow: false } };
}

export default async function GeoMapPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess("reports.read", deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === "login" || access.kind === "password") redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable") return <AdminNotice view={view} current={KEY} text={t(view.dict, "page.noDb")} />;
  if (access.kind === "forbidden")
    return (
      <div className="a2-z lm-rp" data-lm-ready="" data-testid="geo-map-page">
        <ShellState view={view} kind="denied" permission="reports.read" />
      </div>
    );
  const c = (k: string) => t(view.dict, `reportsGeoMap.${k}`);
  const at = { storeId: MOTHER_STORE_ID };
  const held = access.guard.permissions;
  const [setting, currency] = await Promise.all([
    access.deps.resolver.value("reports.geoMap", at) as unknown as Promise<GeoMapSetting>,
    access.deps.resolver.value("store.currency", at) as unknown as Promise<string>,
  ]);
  const canMoney = held?.has("books.read") ?? false;
  const canControlAi = held?.has("ai.control") ?? false;
  const bnLang = view.lang === "bn";
  const categories = (
    await access.deps.db.category.findMany({
      where: { storeId: MOTHER_STORE_ID, archivedAt: null },
      select: { id: true, nameEn: true, nameBn: true },
      orderBy: { nameEn: "asc" },
    })
  ).map((x) => ({ id: x.id, name: bnLang && x.nameBn ? x.nameBn : x.nameEn }));
  // the couriers for the Courier slice and the "Orders by courier" table (names only)
  const couriers = await access.deps.db.courierAccount.findMany({
    where: { storeId: MOTHER_STORE_ID, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const words = ((bnLang ? bn : en).reportsGeoMap.words ?? {}) as GeoMapWords;

  return (
    <div className="a2-z lm-rp" data-lm-ready="" data-testid="geo-map-page">
      <PageHead view={view} place={locateKey(KEY)} title={c("title")} sub={c("sub")} />
      <SectionTabs view={view} current={KEY} />
      <GeoMapScreen
        c={words}
        setting={setting}
        lang={bnLang ? "bn" : "en"}
        locale={view.locale}
        currency={currency}
        categories={categories}
        moneyAllowed={canMoney}
        couriers={couriers}
        canControlAi={canControlAi}
      />
    </div>
  );
}
