"use client";
// S19 · PR 396 (CN-030) — Settings → System → Backups › Restore: staging first, then the same backup on the live shop.
// Step 1 restores a backup into the check copy (never the live database): from Azure Blob (the default when connected),
// the server's disk or Google Drive (the Drive backups listed, newest first), the newest one or (disk, Blob) a minute.
// Step 2, on the newest check copy that passed: "Put this on the live shop" asks for RESTORE typed and the owner's PIN;
// the server restores exactly that backup, keeps the old data, starts the shop again and tells the owner on Telegram.
// Step 1 needs `system.backup`, step 2 `system.restore` (the API checks again). Every word is from
// messages/admin-backups.<lang>.json.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { call, errorText, type Answer } from "@/components/admin/api";
import { dateTime } from "@/components/admin/stock/text";
import { t, type Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";

export interface RestoreRow {
  id: string;
  environment: "staging" | "production";
  source: "blob" | "local" | "drive" | null;
  backup: string | null;
  pointInTime: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
}

export interface LastLiveRestore {
  result?: "ok" | "fail" | "refused";
  at?: string;
  detail?: string;
  from?: string;
  backup?: string;
}

interface DriveRow {
  name: string;
  checked: boolean;
}

const API = "/api/admin/backups";
/** What the owner types before the live shop is replaced (the API and the server check the same word). */
const WORD = "RESTORE";

const local = (
  d: Dict,
  key: string,
  vars: Record<string, string | number> = {},
) => t(d, `backups.${key}`, vars);

const problem = (d: Dict, a: Answer) =>
  errorText((d.backups ?? {}) as Dict, a, {
    message: String(a.data.message ?? ""),
  });

const PILL: Record<string, string> = {
  SUCCEEDED: "ok",
  FAILED: "bad",
  QUEUED: "line",
  RUNNING: "warn",
  CANCELLED: "line",
};

export function RestoreCard({
  d,
  locale,
  timeZone,
  initial,
  lastLive,
  canStage,
  canRestore,
  connected,
}: {
  d: Dict;
  locale: string;
  timeZone: string;
  initial: RestoreRow[];
  lastLive: LastLiveRestore | null;
  canStage: boolean;
  canRestore: boolean;
  connected: { blob: boolean; drive: boolean };
}) {
  const router = useRouter();
  const uid = useId();
  const [rows, setRows] = useState(initial);
  const [source, setSource] = useState<"blob" | "local" | "drive">(
    connected.blob ? "blob" : connected.drive ? "drive" : "local",
  );
  const [minute, setMinute] = useState("");
  const [backup, setBackup] = useState("");
  const [drive, setDrive] = useState<DriveRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [pin, setPin] = useState("");
  const open = rows.some((r) => r.status === "QUEUED" || r.status === "RUNNING");
  const newestStaging = rows.find((r) => r.environment === "staging");
  const ready =
    newestStaging?.status === "SUCCEEDED" && Boolean(newestStaging.backup);
  const when = (iso: string) => dateTime(iso, locale, timeZone);

  const loadDrive = async () => {
    setBusy("drive");
    setNote(null);
    const a = await call("GET", `${API}/drive/list`);
    setBusy(null);
    if (a.status === 200 && a.data.ok) {
      setDrive(
        ((a.data.backups as DriveRow[] | undefined) ?? []).map((b) => ({
          name: b.name,
          checked: b.checked,
        })),
      );
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };

  const stage = async () => {
    setBusy("stage");
    setNote(null);
    const body: Record<string, string> = { source };
    if (source === "drive" && backup) body.backup = backup;
    // The minute as the owner's device shows it, sent in UTC; the server restores to it in its own time zone.
    if (source !== "drive" && minute)
      body.pointInTime = new Date(minute).toISOString();
    const a = await call("POST", `${API}/restore/staging`, body);
    setBusy(null);
    if (a.status === 200 && a.data.ok) {
      setRows((x) => [a.data.restore as RestoreRow, ...x]);
      setNote({ ok: true, text: local(d, "restore.asked") });
      router.refresh();
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };

  const goLive = async () => {
    if (!newestStaging) return;
    setBusy("live");
    setNote(null);
    const a = await call("POST", `${API}/restore/production`, {
      stagingOfId: newestStaging.id,
      confirm: typed,
      pin,
    });
    setBusy(null);
    setPin("");
    if (a.status === 200 && a.data.ok) {
      setRows((x) => [a.data.restore as RestoreRow, ...x]);
      setConfirming(false);
      setTyped("");
      setNote({ ok: true, text: local(d, "restore.liveAsked") });
      router.refresh();
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };

  const id = (k: string) => `${uid}-${k}`;
  return (
    <section
      className="a2-card"
      aria-labelledby="bk-restore"
      data-testid="bk-restore"
    >
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3" id="bk-restore">
            {local(d, "restore.title")}
          </h2>
          <div className="a2-cs">{local(d, "restore.sub")}</div>
        </div>
      </div>

      {canStage ? (
        <div className="a2-scv">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={id("source")}>
              {local(d, "restore.source")}
            </label>
            <select
              id={id("source")}
              className="a2-sel"
              value={source}
              disabled={busy !== null}
              onChange={(e) => {
                setSource(e.target.value as typeof source);
                setBackup("");
                setMinute("");
              }}
              data-testid="bk-restore-source"
            >
              {(["blob", "local", "drive"] as const).map((s) => (
                <option key={s} value={s}>
                  {local(d, `restore.from.${s}`)}
                  {s !== "local" && !connected[s]
                    ? ` (${local(d, "kpi.notConnected")})`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          {source === "drive" ? (
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={id("backup")}>
                {local(d, "restore.backup")}
              </label>
              {drive ? (
                <select
                  id={id("backup")}
                  className="a2-sel"
                  value={backup}
                  disabled={busy !== null}
                  onChange={(e) => setBackup(e.target.value)}
                  data-testid="bk-restore-backup"
                >
                  <option value="">{local(d, "restore.newest")}</option>
                  {drive.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                      {b.checked ? ` · ${local(d, "list.checked")}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  id={id("backup")}
                  type="button"
                  className="a2-btn"
                  onClick={loadDrive}
                  disabled={busy !== null || !connected.drive}
                  aria-busy={busy === "drive" || undefined}
                  data-testid="bk-restore-list"
                >
                  <ShellIcon name="file" size={14} />
                  {local(d, busy === "drive" ? "list.loading" : "list.load")}
                </button>
              )}
              <span className="a2-def a2-blk">
                {local(d, "restore.backupHint")}
              </span>
            </div>
          ) : (
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={id("minute")}>
                {local(d, "restore.minute")}
              </label>
              <input
                id={id("minute")}
                className="a2-inp"
                type="datetime-local"
                value={minute}
                disabled={busy !== null}
                onChange={(e) => setMinute(e.target.value)}
                data-testid="bk-restore-minute"
              />
              <span className="a2-def a2-blk">
                {local(d, "restore.minuteHint")}
              </span>
            </div>
          )}
          <div className="a2-gap8">
            <button
              type="button"
              className="a2-btn pri"
              onClick={stage}
              disabled={busy !== null || open}
              aria-busy={busy === "stage" || undefined}
              data-testid="bk-restore-stage"
            >
              <ShellIcon name="refresh" size={14} />
              {local(d, busy === "stage" ? "requests.asking" : "restore.stage")}
            </button>
          </div>
        </div>
      ) : (
        <p className="a2-xs a2-mute">{local(d, "restore.readOnly")}</p>
      )}

      {note ? (
        <div
          className={`a2-note${note.ok ? "" : " bad"} a2-mt12`}
          role={note.ok ? "status" : "alert"}
          data-testid="bk-restore-note"
        >
          <ShellIcon name={note.ok ? "check" : "alert"} size={15} />
          <span>{note.text}</span>
        </div>
      ) : null}

      {ready && canRestore && !open ? (
        <div className="a2-note warn a2-mt12" data-testid="bk-restore-ready">
          <ShellIcon name="alert" size={15} />
          <div>
            <b>
              {local(d, "restore.readyTitle", {
                backup: newestStaging!.backup ?? "",
              })}
            </b>{" "}
            {local(d, "restore.readyText")}
            {confirming ? (
              <div className="a2-scv a2-mt12">
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={id("word")}>
                    {local(d, "restore.type", { word: WORD })}
                  </label>
                  <input
                    id={id("word")}
                    className="a2-inp"
                    autoComplete="off"
                    spellCheck={false}
                    value={typed}
                    disabled={busy !== null}
                    onChange={(e) => setTyped(e.target.value)}
                    data-testid="bk-restore-word"
                  />
                </div>
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={id("pin")}>
                    {local(d, "drive.pin")}
                  </label>
                  <input
                    id={id("pin")}
                    className="a2-inp"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pin}
                    disabled={busy !== null}
                    onChange={(e) => setPin(e.target.value)}
                    data-testid="bk-restore-pin"
                  />
                </div>
                <div className="a2-gap8">
                  <button
                    type="button"
                    className="a2-btn bad"
                    onClick={goLive}
                    disabled={busy !== null || typed !== WORD || !pin}
                    aria-busy={busy === "live" || undefined}
                    data-testid="bk-restore-live"
                  >
                    {local(
                      d,
                      busy === "live" ? "requests.asking" : "restore.live",
                    )}
                  </button>
                  <button
                    type="button"
                    className="a2-btn ghost"
                    onClick={() => {
                      setConfirming(false);
                      setTyped("");
                      setPin("");
                    }}
                    disabled={busy !== null}
                  >
                    {local(d, "restore.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="a2-gap8 a2-mt12">
                <button
                  type="button"
                  className="a2-btn"
                  onClick={() => setConfirming(true)}
                  data-testid="bk-restore-open"
                >
                  {local(d, "restore.goLive")}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{local(d, "requests.what")}</th>
                <th>{local(d, "restore.backupCol")}</th>
                <th>{local(d, "requests.when")}</th>
                <th>{local(d, "requests.status")}</th>
                <th>{local(d, "requests.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="a2-tdh">
                    <b className="a2-blk">
                      {local(d, `restore.env.${r.environment}`)}
                    </b>
                    <span className="a2-xs a2-mute">
                      {r.source ? local(d, `restore.from.${r.source}`) : "—"}
                    </span>
                  </td>
                  <td data-l={local(d, "restore.backupCol")}>
                    {r.backup ??
                      (r.pointInTime
                        ? when(r.pointInTime)
                        : local(d, "restore.newest"))}
                  </td>
                  <td data-l={local(d, "requests.when")}>
                    {when(r.createdAt)}
                  </td>
                  <td data-l={local(d, "requests.status")}>
                    <span className={`a2-pill ${PILL[r.status] ?? "line"}`}>
                      {local(d, `requests.state.${r.status}`)}
                    </span>
                  </td>
                  <td data-l={local(d, "requests.detail")} className="a2-xs">
                    {r.detail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="a2-sm a2-mute a2-mt12">{local(d, "restore.none")}</p>
      )}

      {lastLive?.at ? (
        <div className="a2-rule a2-mt12" data-testid="bk-restore-last">
          <span>
            <b className="a2-blk">
              {local(d, "restore.lastLive", { at: when(lastLive.at) })}
            </b>
            <span className="a2-xs a2-mute">{lastLive.detail ?? "—"}</span>
          </span>
          <span
            className={`a2-pill ${lastLive.result === "ok" ? "ok" : "bad"}`}
          >
            {local(d, `restore.result.${lastLive.result ?? "fail"}`)}
          </span>
        </div>
      ) : null}
    </section>
  );
}
