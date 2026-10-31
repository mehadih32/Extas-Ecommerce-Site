"use client";
// S19 · PR 507 (CN-030) — Settings → System → Backups, the parts of PR 507: "Back up now" and "Run the restore drill
// now" with the last requests (the server runs each within a few minutes and writes back what happened), and the
// backup settings card — the nightly time, the days each copy is kept, how many checked copies Drive keeps, the monthly
// restore drill (day, time, Blob, Drive) and Telegram, with the rare ones (WAL days, the free share, the Drive folder's
// name) under "More options". Seeing needs `system.read`; the buttons and Save need `system.backup` (the API checks
// again). Every word is from messages/admin-backups.<lang>.json.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { call, errorText, type Answer } from "@/components/admin/api";
import { dateTime } from "@/components/admin/stock/text";
import { t, type Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";

export interface BackupSettings {
  drive: { folderName: string; keepCopies: number };
  plan: {
    dailyTime: string;
    keepLocalDays: number;
    keepBlobDays: number;
    keepDriveDays: number;
    keepLocalWalDays: number;
    minFreePct: number;
  };
  drill: {
    enabled: boolean;
    dayOfMonth: number;
    time: string;
    blob: boolean;
    drive: boolean;
  };
  alerts: { telegramOnFail: boolean; telegramOnSuccess: boolean };
}

export interface RequestRow {
  id: string;
  kind: "BACKUP" | "RESTORE_DRILL";
  source: string | null;
  status: string;
  detail: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const API = "/api/admin/backups";

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

/** "Back up now", "Run the restore drill now" and the last requests. */
export function RequestsCard({
  d,
  locale,
  timeZone,
  initial,
  canRun,
}: {
  d: Dict;
  locale: string;
  timeZone: string;
  initial: RequestRow[];
  canRun: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const open = (kind: RequestRow["kind"]) =>
    rows.some(
      (r) =>
        r.kind === kind && (r.status === "QUEUED" || r.status === "RUNNING"),
    );
  const ask = async (kind: RequestRow["kind"]) => {
    setBusy(kind);
    setNote(null);
    const a = await call(
      "POST",
      `${API}/request`,
      kind === "RESTORE_DRILL" ? { kind, source: "all" } : { kind },
    );
    setBusy(null);
    if (a.status === 200 && a.data.ok) {
      setRows((x) => [a.data.request as RequestRow, ...x]);
      setNote({ ok: true, text: local(d, "requests.asked") });
      router.refresh();
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };
  return (
    <section
      className="a2-card"
      aria-labelledby="bk-req"
      data-testid="bk-requests"
    >
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3" id="bk-req">
            {local(d, "requests.title")}
          </h2>
          <div className="a2-cs">{local(d, "requests.sub")}</div>
        </div>
      </div>
      {canRun ? (
        <div className="a2-gap8">
          {(["BACKUP", "RESTORE_DRILL"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={k === "BACKUP" ? "a2-btn pri" : "a2-btn"}
              onClick={() => ask(k)}
              disabled={busy !== null || open(k)}
              aria-busy={busy === k || undefined}
              data-testid={`bk-ask-${k.toLowerCase()}`}
            >
              <ShellIcon name={k === "BACKUP" ? "dl" : "refresh"} size={14} />
              {local(d, busy === k ? "requests.asking" : `requests.${k}`)}
            </button>
          ))}
        </div>
      ) : (
        <p className="a2-xs a2-mute">{local(d, "requests.readOnly")}</p>
      )}
      {note ? (
        <div
          className={`a2-note${note.ok ? "" : " bad"} a2-mt12`}
          role={note.ok ? "status" : "alert"}
          data-testid="bk-req-note"
        >
          <ShellIcon name={note.ok ? "check" : "alert"} size={15} />
          <span>{note.text}</span>
        </div>
      ) : null}
      {rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl">
            <thead>
              <tr>
                <th>{local(d, "requests.what")}</th>
                <th>{local(d, "requests.when")}</th>
                <th>{local(d, "requests.status")}</th>
                <th>{local(d, "requests.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="a2-tdh">
                    <b>{local(d, `requests.kind.${r.kind}`)}</b>
                  </td>
                  <td data-l={local(d, "requests.when")}>
                    {dateTime(r.createdAt, locale, timeZone)}
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
        <p className="a2-sm a2-mute a2-mt12">{local(d, "requests.none")}</p>
      )}
    </section>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  def,
  disabled,
  onChange,
  d,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  def: number;
  disabled: boolean;
  onChange(v: number): void;
  d: Dict;
}) {
  return (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="a2-inp"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))
        }
        data-testid={id}
      />
      <span className="a2-def a2-blk">
        {hint ? `${hint} · ` : ""}
        {local(d, "plan.default", { v: def })}
      </span>
    </div>
  );
}

function TimeField({
  id,
  label,
  value,
  def,
  disabled,
  onChange,
  d,
}: {
  id: string;
  label: string;
  value: string;
  def: string;
  disabled: boolean;
  onChange(v: string): void;
  d: Dict;
}) {
  return (
    <div className="a2-fld">
      <label className="a2-lbl" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="a2-inp"
        type="time"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        data-testid={id}
      />
      <span className="a2-def a2-blk">
        {local(d, "plan.default", { v: def })}
      </span>
    </div>
  );
}

function Switch({
  label,
  hint,
  on,
  disabled,
  onChange,
  d,
  testId,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled: boolean;
  onChange(v: boolean): void;
  d: Dict;
  testId: string;
}) {
  return (
    <div className="a2-fld a2-swl">
      <span>
        {label}
        {hint ? <span className="a2-def a2-blk">{hint}</span> : null}
      </span>
      <button
        type="button"
        className={`a2-sw${on ? " on" : ""}`}
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${local(d, on ? "plan.on" : "plan.off")}`}
        disabled={disabled}
        onClick={() => onChange(!on)}
        data-testid={testId}
      />
    </div>
  );
}

/** The backup settings card (PR 507). */
export function BackupSettingsCard({
  d,
  values,
  defaults,
  canWrite,
}: {
  d: Dict;
  values: BackupSettings;
  defaults: BackupSettings;
  canWrite: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState(values);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const ro = !canWrite || busy;
  const plan = (p: Partial<BackupSettings["plan"]>) =>
    setV((x) => ({ ...x, plan: { ...x.plan, ...p } }));
  const drill = (p: Partial<BackupSettings["drill"]>) =>
    setV((x) => ({ ...x, drill: { ...x.drill, ...p } }));
  const alerts = (p: Partial<BackupSettings["alerts"]>) =>
    setV((x) => ({ ...x, alerts: { ...x.alerts, ...p } }));
  const drive = (p: Partial<BackupSettings["drive"]>) =>
    setV((x) => ({ ...x, drive: { ...x.drive, ...p } }));
  const save = async () => {
    setBusy(true);
    setNote(null);
    const a = await call("PUT", `${API}/settings`, v);
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      const changed = (a.data.changed as string[] | undefined) ?? [];
      setV(a.data.settings as BackupSettings);
      setNote({
        ok: true,
        text: local(d, changed.length ? "plan.saved" : "plan.unchanged"),
      });
      router.refresh();
      return;
    }
    setNote({ ok: false, text: problem(d, a) });
  };
  const id = (k: string) => `${uid}-${k}`;
  return (
    <section className="a2-sc" id="a2s-backup-plan" data-testid="bk-plan">
      <div className="a2-sch">
        <div>
          <div className="a2-scw">{local(d, "plan.where")}</div>
          <h2 className="a2-h3">{local(d, "plan.title")}</h2>
          <p className="a2-scd">{local(d, "plan.desc")}</p>
        </div>
      </div>
      <div className="a2-scb">
        <div className="a2-scv">
          <TimeField
            id={id("time")}
            d={d}
            label={local(d, "plan.dailyTime")}
            value={v.plan.dailyTime}
            def={defaults.plan.dailyTime}
            disabled={ro}
            onChange={(dailyTime) => plan({ dailyTime })}
          />
          <NumberField
            id={id("local")}
            d={d}
            label={local(d, "plan.keepLocalDays")}
            value={v.plan.keepLocalDays}
            min={1}
            max={90}
            def={defaults.plan.keepLocalDays}
            disabled={ro}
            onChange={(keepLocalDays) => plan({ keepLocalDays })}
          />
          <NumberField
            id={id("blob")}
            d={d}
            label={local(d, "plan.keepBlobDays")}
            value={v.plan.keepBlobDays}
            min={1}
            max={3650}
            def={defaults.plan.keepBlobDays}
            disabled={ro}
            onChange={(keepBlobDays) => plan({ keepBlobDays })}
          />
          <NumberField
            id={id("copies")}
            d={d}
            label={local(d, "plan.keepCopies")}
            hint={local(d, "plan.keepCopiesHint")}
            value={v.drive.keepCopies}
            min={0}
            max={60}
            def={defaults.drive.keepCopies}
            disabled={ro}
            onChange={(keepCopies) => drive({ keepCopies })}
          />
          {v.drive.keepCopies === 0 ? (
            <NumberField
              id={id("drive")}
              d={d}
              label={local(d, "plan.keepDriveDays")}
              value={v.plan.keepDriveDays}
              min={1}
              max={3650}
              def={defaults.plan.keepDriveDays}
              disabled={ro}
              onChange={(keepDriveDays) => plan({ keepDriveDays })}
            />
          ) : null}
        </div>
        <div className="a2-sm a2-b a2-mt12">{local(d, "plan.drillTitle")}</div>
        <div className="a2-scv a2-mt12">
          <Switch
            d={d}
            label={local(d, "plan.drillOn")}
            hint={local(d, "plan.drillOnHint")}
            on={v.drill.enabled}
            disabled={ro}
            onChange={(enabled) => drill({ enabled })}
            testId="bk-drill-on"
          />
          {v.drill.enabled ? (
            <>
              <NumberField
                id={id("day")}
                d={d}
                label={local(d, "plan.drillDay")}
                value={v.drill.dayOfMonth}
                min={1}
                max={28}
                def={defaults.drill.dayOfMonth}
                disabled={ro}
                onChange={(dayOfMonth) => drill({ dayOfMonth })}
              />
              <TimeField
                id={id("dtime")}
                d={d}
                label={local(d, "plan.drillTime")}
                value={v.drill.time}
                def={defaults.drill.time}
                disabled={ro}
                onChange={(time) => drill({ time })}
              />
              <Switch
                d={d}
                label={local(d, "plan.drillBlob")}
                on={v.drill.blob}
                disabled={ro}
                onChange={(blob) => drill({ blob })}
                testId="bk-drill-blob"
              />
              <Switch
                d={d}
                label={local(d, "plan.drillDrive")}
                on={v.drill.drive}
                disabled={ro}
                onChange={(dr) => drill({ drive: dr })}
                testId="bk-drill-drive"
              />
            </>
          ) : null}
        </div>
        <div className="a2-sm a2-b a2-mt12">{local(d, "plan.alertsTitle")}</div>
        <div className="a2-scv a2-mt12">
          <Switch
            d={d}
            label={local(d, "plan.tgFail")}
            hint={local(d, "plan.tgFailHint")}
            on={v.alerts.telegramOnFail}
            disabled={ro}
            onChange={(telegramOnFail) => alerts({ telegramOnFail })}
            testId="bk-tg-fail"
          />
          <Switch
            d={d}
            label={local(d, "plan.tgOk")}
            on={v.alerts.telegramOnSuccess}
            disabled={ro}
            onChange={(telegramOnSuccess) => alerts({ telegramOnSuccess })}
            testId="bk-tg-ok"
          />
        </div>
        <details className="a2-mt12 a2-more-opts">
          <summary className="a2-sm a2-b">{local(d, "plan.more")}</summary>
          <div className="a2-scv a2-mt12">
            <NumberField
              id={id("wal")}
              d={d}
              label={local(d, "plan.keepLocalWalDays")}
              hint={local(d, "plan.keepLocalWalHint")}
              value={v.plan.keepLocalWalDays}
              min={1}
              max={30}
              def={defaults.plan.keepLocalWalDays}
              disabled={ro}
              onChange={(keepLocalWalDays) => plan({ keepLocalWalDays })}
            />
            <NumberField
              id={id("free")}
              d={d}
              label={local(d, "plan.minFreePct")}
              hint={local(d, "plan.minFreeHint")}
              value={v.plan.minFreePct}
              min={5}
              max={60}
              def={defaults.plan.minFreePct}
              disabled={ro}
              onChange={(minFreePct) => plan({ minFreePct })}
            />
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={id("folder")}>
                {local(d, "plan.folderName")}
              </label>
              <input
                id={id("folder")}
                className="a2-inp"
                maxLength={100}
                value={v.drive.folderName}
                disabled={ro}
                onChange={(e) => drive({ folderName: e.target.value })}
                data-testid="bk-folder-name"
              />
              <span className="a2-def a2-blk">
                {local(d, "plan.folderHint")} ·{" "}
                {local(d, "plan.default", { v: defaults.drive.folderName })}
              </span>
            </div>
          </div>
        </details>
        {canWrite ? (
          <div className="a2-gap8 a2-mt12">
            <button
              type="button"
              className="a2-btn pri"
              onClick={save}
              disabled={busy}
              aria-busy={busy || undefined}
              data-testid="bk-plan-save"
            >
              {local(d, busy ? "plan.saving" : "plan.save")}
            </button>
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12">{local(d, "plan.readOnly")}</p>
        )}
        {note ? (
          <div
            className={`a2-note${note.ok ? "" : " bad"} a2-mt12`}
            role={note.ok ? "status" : "alert"}
            data-testid="bk-plan-note"
          >
            <ShellIcon name={note.ok ? "check" : "alert"} size={15} />
            <span>{note.text}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
