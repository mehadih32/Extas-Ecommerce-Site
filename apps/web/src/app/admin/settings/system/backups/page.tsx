// S19 · PR 395 (CN-030) — Settings → System → Backups at /admin/settings/system/backups (demo V12.4 89v-admin-server.js
// "Backups"; docs/BACKEND-ARCHITECTURE.md): the last server copy, Google Drive, Azure Blob and the restore test as four
// boxes (the files the server's extas-backup and extas-restore write), the one-click Google Drive card (the owner's own
// client "TVs and Limited Input devices", the code for google.com/device, scope drive.file only, the newest
// `backups.drive.keepCopies` checked copies kept), Azure Blob's card, and the last nightly runs. Seeing needs
// `system.read`; connecting, disconnecting and the client need `vault.write`, and the risky ones the owner's PIN.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { driveView } from "@extas/jobs";
import { AdminNotice } from "@/components/admin/AdminFrame";
import { DriveCard } from "@/components/admin/settings/BackupsScreen";
import {
  PageHead,
  SectionTabs,
  ShellState,
} from "@/components/admin/shell/ShellParts";
import { ShellIcon } from "@/components/admin/shell/ShellIcon";
import { dateTime } from "@/components/admin/stock/text";
import { adminDeps } from "@/lib/admin-auth";
import { ADMIN_LOGIN } from "@/lib/admin-nav";
import { adminView, pageAccess, type AdminView } from "@/lib/admin-page";
import { locateKey } from "@/lib/admin-shell/sections";
import { t, type Dict } from "@/lib/i18n";
import { runtimeState, type Backup } from "@/lib/status";
import bn from "../../../../../../messages/admin-backups.bn.json";
import en from "../../../../../../messages/admin-backups.en.json";
import "../../settings.css";

export const dynamic = "force-dynamic";

const HERE = "/admin/settings/system/backups";
const KEY = "backups";

/** The admin dictionary with this screen's own messages under `backups.*`. */
function withScreen(view: AdminView): AdminView {
  return {
    ...view,
    dict: { ...view.dict, backups: (view.lang === "bn" ? bn : en) as Dict },
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return {
    title: t(view.dict, "backups.metaTitle"),
    robots: { index: false, follow: false },
  };
}

const PILL: Record<string, string> = { ok: "ok", fail: "bad", off: "line" };

export default async function BackupsPage() {
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
    t(d, `backups.${k}`, vars);
  const vault = access.deps.vault;
  const [state, drive, settings] = await Promise.all([
    runtimeState(),
    vault
      ? driveView({ db: access.deps.db, vault, now: access.deps.now })
      : Promise.resolve(null),
    access.deps.resolver.value("backups.drive"),
  ]);
  const canWrite =
    Boolean(vault) && (access.guard.permissions?.has("vault.write") ?? false);
  const when = (iso?: string) =>
    iso ? dateTime(iso, view.locale, view.timeZone) : c("kpi.never");
  const result = (b: Backup | null) =>
    b?.result ? c(`kpi.${b.result}`) : c("kpi.never");
  const runs: [string, Backup | null][] = [
    ["local", state.backups.local],
    ["blob", state.backups.blob],
    ["drive", state.backups.drive],
    ["test", state.restoreTest],
  ];
  const kpis: [string, string, string, string | undefined][] = [
    [
      "local",
      result(state.backups.local),
      when(state.backups.local?.at),
      state.backups.local?.result,
    ],
    [
      "drive",
      c(drive?.connected ? "kpi.connected" : "kpi.notConnected"),
      state.backups.drive?.at
        ? `${result(state.backups.drive)} · ${when(state.backups.drive.at)}`
        : c("kpi.never"),
      drive?.connected ? (state.backups.drive?.result ?? "ok") : "off",
    ],
    [
      "blob",
      result(state.backups.blob),
      when(state.backups.blob?.at),
      state.backups.blob?.result,
    ],
    [
      "test",
      result(state.restoreTest),
      state.restoreTest?.at ? when(state.restoreTest.at) : c("kpi.testSub"),
      state.restoreTest?.result,
    ],
  ];

  return (
    <div className="a2-z" data-testid="backups-page">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={c("title")}
        sub={c("sub")}
      />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis">
        {kpis.map(([k, value, foot, tone]) => (
          <div
            key={k}
            className="a2-card a2-kpi"
            data-testid={`bk-kpi-${k}`}
            data-result={tone ?? "none"}
          >
            <div className="a2-kl">{c(`kpi.${k}`)}</div>
            <div className="a2-kv a2-sm a2-kvw">
              <span className={`a2-pill ${PILL[tone ?? ""] ?? "line"}`}>
                {value}
              </span>
            </div>
            <div className="a2-kf">
              <span className="a2-kn">{foot}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="a2-note a2-mt12">
        <ShellIcon name="shield" size={16} />
        <div>
          <b>{c("safe.title")}</b> {c("safe.text")}
        </div>
      </div>

      <div className="a2-row a2-r21 a2-mt12">
        <div>
          {drive ? (
            <DriveCard
              d={d}
              locale={view.locale}
              timeZone={view.timeZone}
              initial={{
                client: drive.client,
                connected: drive.connected,
                account: drive.account,
                folderName: drive.folderName,
                pending: drive.pending,
                lastTest: drive.lastTest,
              }}
              keepCopies={settings.keepCopies}
              canWrite={canWrite}
            />
          ) : (
            <div className="a2-note bad" role="alert">
              <ShellIcon name="alert" size={15} />
              <span>{c("errors.VAULT_NOT_CONFIGURED")}</span>
            </div>
          )}
        </div>
        <section
          className="a2-card"
          aria-labelledby="bk-blob"
          data-testid="bk-blob"
        >
          <div className="a2-ch">
            <div>
              <h2 className="a2-h3" id="bk-blob">
                {c("blob.title")}
              </h2>
              <div className="a2-cs">{c("blob.desc")}</div>
            </div>
          </div>
          <Link className="a2-btn a2-mt12" href="/admin/integrations">
            <ShellIcon name="ext" size={14} />
            {c("blob.open")}
          </Link>
        </section>
      </div>

      <section
        className="a2-card a2-mt12"
        aria-labelledby="bk-runs"
        data-testid="bk-runs"
      >
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="bk-runs">
              {c("server.title")}
            </h2>
            <div className="a2-cs">{c("server.sub")}</div>
          </div>
        </div>
        {runs.some(([, b]) => b) ? (
          <div className="a2-tblw">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{c("server.what")}</th>
                  <th>{c("server.result")}</th>
                  <th>{c("server.at")}</th>
                  <th>{c("server.detail")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(([k, b]) => (
                  <tr key={k}>
                    <td className="a2-tdh">
                      <b>{c(`server.${k}`)}</b>
                    </td>
                    <td data-l={c("server.result")}>
                      <span
                        className={`a2-pill ${PILL[b?.result ?? ""] ?? "line"}`}
                      >
                        {result(b)}
                      </span>
                    </td>
                    <td data-l={c("server.at")}>{when(b?.at)}</td>
                    <td data-l={c("server.detail")} className="a2-xs">
                      {b?.detail ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute">{c("server.none")}</p>
        )}
      </section>
    </div>
  );
}
