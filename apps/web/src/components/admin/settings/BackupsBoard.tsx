"use client";
// D10 · PR 1004 — Settings › Backups & restore, the two cards the prototype v5 draws side by side under the big light
// (m-settings.js `renderBackups`): "Schedule" (Back up every 6 hours / 12 hours (twice a day) / day; Keep on the server: newest
// 3–7; the Google Drive line; "Save schedule") and "Monthly restore drill" (the last drill's result in words, "Run drill now",
// "Restore guide (PDF)"). The schedule is the setting `backups.schedule`, saved through /api/admin/system-settings; the drill and
// the guide use the same requests as the older cards under More options. Seeing needs `system.read`; saving and the drill `system.backup`.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { call, errorText, type Answer } from "@/components/admin/api";
import { showToast } from "@/components/admin/lumen/Toast";
import { t, type Dict } from "@/lib/i18n";
import { ShellIcon } from "../shell/ShellIcon";

const API = "/api/admin/backups";
const w = (d: Dict, key: string, vars: Record<string, string | number> = {}) => t(d, `backups.board.${key}`, vars);
const old = (d: Dict, key: string) => t(d, `backups.${key}`);
const problem = (d: Dict, a: Answer) => errorText((d.backups ?? {}) as Dict, a, { message: String(a.data.message ?? "") });

export interface DrillSummary {
  /** `ok` / `fail` / null (never ran). */
  result: "ok" | "fail" | null;
  /** The date in the person's language, already formatted. */
  when: string | null;
  detail: string | null;
}

export function BackupScheduleCard({
  d,
  every,
  keep,
  everyOptions,
  keepOptions,
  dailyTime,
  driveKeeps,
  canEdit,
}: {
  d: Dict;
  every: number;
  keep: number;
  everyOptions: readonly number[];
  keepOptions: readonly number[];
  dailyTime: string;
  driveKeeps: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [e, setE] = useState(every);
  const [k, setK] = useState(keep);
  const [busy, setBusy] = useState(false);
  const dirty = e !== every || k !== keep;
  const save = async () => {
    setBusy(true);
    const a = await call("POST", "/api/admin/system-settings", { action: "schedule", everyHours: e, keepOnServer: k });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      showToast({ text: w(d, "schedule.saved"), tone: "ok" });
      router.refresh();
    } else showToast({ text: problem(d, a), tone: "bad" });
  };
  return (
    <section className="a2-card" aria-labelledby={`${uid}-h`} data-testid="bk-schedule">
      <h2 className="a2-h3" id={`${uid}-h`}>
        {w(d, "schedule.h")}
      </h2>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor={`${uid}-e`}>
          {w(d, "schedule.every")}
        </label>
        <select id={`${uid}-e`} className="a2-sel" value={e} disabled={!canEdit || busy} onChange={(x) => setE(Number(x.target.value))} data-testid="bk-every">
          {everyOptions.map((h) => (
            <option key={h} value={h}>
              {h >= 24 ? w(d, "schedule.daily", { time: dailyTime }) : w(d, `schedule.h${h}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld a2-mt12">
        <label className="a2-lbl" htmlFor={`${uid}-k`}>
          {w(d, "schedule.keep")}
        </label>
        <select id={`${uid}-k`} className="a2-sel" value={k} disabled={!canEdit || busy} onChange={(x) => setK(Number(x.target.value))} data-testid="bk-keep">
          {keepOptions.map((n) => (
            <option key={n} value={n}>
              {w(d, "schedule.newest", { n })}
            </option>
          ))}
        </select>
      </div>
      <p className="a2-sm a2-mute a2-mt12">{w(d, "schedule.drive", { n: driveKeeps })}</p>
      <div className="a2-mt12">
        <button type="button" className="a2-btn" disabled={!canEdit || busy || !dirty} onClick={() => void save()} aria-busy={busy || undefined} data-testid="bk-schedule-save">
          {w(d, "schedule.save")}
        </button>
      </div>
    </section>
  );
}

export function BackupDrillCard({ d, drill, canRun, drillOpen }: { d: Dict; drill: DrillSummary; canRun: boolean; drillOpen: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const a = await call("POST", `${API}/request`, { kind: "RESTORE_DRILL", source: "all" });
    setBusy(false);
    if (a.status === 200 && a.data.ok) {
      showToast({ text: old(d, "requests.asked"), tone: "ok" });
      router.refresh();
    } else showToast({ text: problem(d, a), tone: "bad" });
  };
  const tone = drill.result === "ok" ? "" : drill.result === "fail" ? " bad" : " off";
  return (
    <section className="a2-card" aria-labelledby="bk-drill-h" data-testid="bk-drill-card">
      <h2 className="a2-h3" id="bk-drill-h">
        {w(d, "drill.h")}
      </h2>
      <div className="sy-light a2-mt12" data-testid="bk-drill-result">
        <i className={`sy-dot${tone}`} aria-hidden="true" />
        <div>
          <b>{drill.result === "ok" ? w(d, "drill.passed", { when: drill.when ?? "" }) : drill.result === "fail" ? w(d, "drill.failed", { when: drill.when ?? "" }) : w(d, "drill.none")}</b>
          {drill.detail ? <span className="a2-scd sy-t">{drill.detail}</span> : null}
        </div>
      </div>
      <div className="sy-links">
        {canRun ? (
          <button type="button" className="a2-btn" onClick={() => void run()} disabled={busy || drillOpen} aria-busy={busy || undefined} data-testid="bk-drill-run">
            {old(d, "requests.RESTORE_DRILL")}
          </button>
        ) : null}
        <Link className="a2-btn" href={`${API}/restore-guide`} target="_blank" rel="noopener" data-testid="bk-drill-guide">
          <ShellIcon name="dl" size={14} />
          {old(d, "guide.button")}
        </Link>
      </div>
    </section>
  );
}
