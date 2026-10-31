// S19 · PR 393 (CN-031) — Settings → System → Go-live at /admin/settings/system/go-live: everything that must be true
// before real orders in one list (lib/go-live.ts): automatic items read from what the server wrote and the shop's own
// records, items a person checks and confirms (`system.golive`), and the owner's own steps. Seeing needs
// `system.read`. It only reports: nothing is switched, opened or blocked here.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { GoLiveList } from "@/components/admin/settings/GoLiveScreen";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { ShellIcon } from "@/components/admin/shell/ShellIcon";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { goLiveNow } from "@/lib/go-live-api";
import { t, type Dict } from "@/lib/i18n";
import bn from "../../../../../../messages/admin-golive.bn.json";
import en from "../../../../../../messages/admin-golive.en.json";
import "../../settings.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/settings/system/go-live";
const KEY = "golive";

/** The admin dictionary with this screen's own messages under `golive.*`. */
function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: { ...view.dict, golive: (view.lang === "bn" ? bn : en) as Dict },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: t(view.dict, "golive.metaTitle"),
    robots: { index: false, follow: false },
  };
}

export default async function GoLivePage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([
    adminView(deps),
    pageAccess("system.read", deps),
  ]);
  const view = withScreen(plain);
  if (access.kind === "login" || access.kind === "password")
    redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === "unavailable")
    return (
      <AdminNotice view={view} current={KEY} text={t(view.dict, "page.noDb")} />
    );
  if (access.kind === "forbidden")
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="system.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) =>
    t(d, `golive.${k}`, vars);
  const now = await goLiveNow(access.deps);
  const canSign = access.guard.permissions?.has("system.golive") ?? false;

  return (
    <div className="a2-z" data-testid="golive-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={c("title")}
        sub={c("sub")}
      />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>
          <b>{c("safe.title")}</b> {c("safe.text")}{" "}
          <Link href="/admin/settings/system/backups">{c("safe.backups")}</Link>
        </div>
      </div>

      <GoLiveList
        d={d}
        locale={view.locale}
        timeZone={view.timeZone}
        initial={now}
        canSign={canSign}
      />
    </div>
  );
}
