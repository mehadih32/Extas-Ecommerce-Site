"use client";
// PR 854 (admin prototype v5, Reports toolbar) — the "Schedule" button. It opens the prototype's box "Send this report by itself":
// Telegram and/or e-mail, how often (every day, every Monday, the 1st of the month) and at what hour, with "Save schedule", "Turn off"
// and "Cancel". The button turns solid and says "Scheduled" while one is on. One row per report (POST /api/admin/reports/schedule,
// `ReportSchedule`, reportKey `report:<tab>`); the nightly job sends the owner a short summary. Nothing goes to a buyer or a supplier.
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { call } from "../api";
import { showToast } from "../lumen/Toast";
import { useDialogKeys } from "../orders/OrderCommands";
import { ShellIcon } from "../shell/ShellIcon";

type Freq = "daily" | "weekly" | "monthly";
interface Sched {
  enabled: boolean;
  frequency: Freq;
  time: string;
  channels: string[];
}

export interface ScheduleTexts {
  button: string;
  scheduled: string;
  title: string;
  intro: string;
  telegram: string;
  telegramSub: string;
  email: string;
  emailNone: string;
  how: string;
  time: string;
  daily: string;
  weekly: string;
  monthly: string;
  save: string;
  off: string;
  cancel: string;
  pick: string;
  /** Has `{name}` and `{when}`. */
  saved: string;
  turnedOff: string;
  failed: string;
  close: string;
  working: string;
}

const TIMES = ["08:00", "09:00", "10:00", "18:00", "21:00"]; // hardcode-ok: the prototype's own hours (the server takes any HH:MM)
const noSubscribe = () => () => {};

/** "Every Monday · 09:00 · Telegram + Email" — the prototype's one-line summary of a schedule. */
export function scheduleText(
  s: Pick<Sched, "frequency" | "time" | "channels">,
  t: Pick<ScheduleTexts, "daily" | "weekly" | "monthly" | "telegram" | "email">,
): string {
  const when = { daily: t.daily, weekly: t.weekly, monthly: t.monthly }[
    s.frequency
  ];
  const where = [
    s.channels.includes("telegram") ? t.telegram : "",
    s.channels.includes("email") ? t.email : "",
  ]
    .filter(Boolean)
    .join(" + ");
  return `${when} · ${s.time} · ${where}`;
}

export function ScheduleButton({
  report,
  name,
  texts: x,
  testId,
}: {
  report: string;
  name: string;
  texts: ScheduleTexts;
  testId: string;
}) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState<Sched | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [form, setForm] = useState<Sched>({
    enabled: false,
    frequency: "weekly",
    time: "09:00",
    channels: ["telegram"],
  });
  const [warn, setWarn] = useState("");
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  useDialogKeys(box, () => setOpen(false));
  useEffect(() => {
    let live = true;
    void call(
      "GET",
      `/api/admin/reports/schedule?report=${encodeURIComponent(report)}`,
    ).then((a) => {
      if (!live || a.status !== 200) return;
      const s = a.data.schedule as Sched;
      setCur(s);
      setForm({ ...s, enabled: true });
      setEmail((a.data.email as string | null) ?? null);
    });
    return () => {
      live = false;
    };
  }, [report]);
  const on = !!cur?.enabled;
  const has = (ch: string) => form.channels.includes(ch);
  const flip = (ch: string) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }));
  const send = async (enabled: boolean) => {
    if (busy) return;
    if (enabled && !form.channels.length) {
      setWarn(x.pick);
      return;
    }
    setBusy(true);
    const a = await call("POST", "/api/admin/reports/schedule", {
      report,
      frequency: form.frequency,
      time: form.time,
      channels: form.channels,
      enabled,
    });
    setBusy(false);
    if (a.status !== 200) {
      setWarn(x.failed);
      return;
    }
    const s = a.data.schedule as Sched;
    setCur(s);
    setWarn("");
    setOpen(false);
    showToast({
      text: enabled
        ? x.saved.replace("{name}", name).replace("{when}", scheduleText(s, x))
        : x.turnedOff,
      tone: "ok",
    });
  };
  return (
    <>
      <button
        type="button"
        className={`a2-btn sm cr-tap${on ? " pri" : ""}`}
        onClick={() => setOpen(true)}
        title={cur && on ? scheduleText(cur, x) : undefined}
        aria-haspopup="dialog"
        data-testid={testId}
      >
        <ShellIcon name="msg" size={14} /> {on ? x.scheduled : x.button}
      </button>
      {open && mounted
        ? createPortal(
            <div
              className="adm2 a2-z a2-ov mid"
              onMouseDown={(e) =>
                e.target === e.currentTarget && setOpen(false)
              }
            >
              <div
                ref={box}
                className="a2-dlg"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${uid}-t`}
                data-testid={`${testId}-dialog`}
              >
                <div className="a2-dlgh">
                  <h2 className="a2-h3" id={`${uid}-t`}>
                    {x.title}
                  </h2>
                  <button
                    type="button"
                    className="a2-icb"
                    onClick={() => setOpen(false)}
                    aria-label={x.close}
                  >
                    <ShellIcon name="x" size={18} />
                  </button>
                </div>
                <div className="a2-dlgb">
                  <p className="a2-cs">{x.intro.replace("{name}", name)}</p>
                  <label className="a2-chkl a2-mt12 cr-tap">
                    <input
                      type="checkbox"
                      checked={has("telegram")}
                      onChange={() => flip("telegram")}
                      data-testid={`${testId}-tg`}
                    />
                    <span>
                      <b>{x.telegram}</b>
                      <span className="a2-xs a2-mute a2-blk">
                        {x.telegramSub}
                      </span>
                    </span>
                  </label>
                  <label className="a2-chkl a2-mt6 cr-tap">
                    <input
                      type="checkbox"
                      checked={has("email")}
                      onChange={() => flip("email")}
                      data-testid={`${testId}-em`}
                    />
                    <span>
                      <b>{x.email}</b>
                      <span className="a2-xs a2-mute a2-blk">
                        {email ?? x.emailNone}
                      </span>
                    </span>
                  </label>
                  <div
                    className="a2-mt12"
                    style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                  >
                    <label
                      className="a2-xs a2-mute"
                      style={{ flex: "1 1 160px" }}
                    >
                      {x.how}
                      <select
                        className="a2-inp"
                        value={form.frequency}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            frequency: e.target.value as Freq,
                          }))
                        }
                        data-testid={`${testId}-fq`}
                      >
                        {(["daily", "weekly", "monthly"] as const).map((k) => (
                          <option key={k} value={k}>
                            {x[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label
                      className="a2-xs a2-mute"
                      style={{ flex: "1 1 120px" }}
                    >
                      {x.time}
                      <select
                        className="a2-inp"
                        value={form.time}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, time: e.target.value }))
                        }
                        data-testid={`${testId}-tm`}
                      >
                        {(TIMES.includes(form.time)
                          ? TIMES
                          : [...TIMES, form.time].sort()
                        ).map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {warn ? (
                    <p className="a2-sm bk-warn a2-mt6" role="alert">
                      {warn}
                    </p>
                  ) : null}
                </div>
                <div className="a2-dlgf">
                  {on ? (
                    <button
                      type="button"
                      className="a2-btn danger"
                      onClick={() => void send(false)}
                      disabled={busy}
                      data-testid={`${testId}-off`}
                    >
                      {x.off}
                    </button>
                  ) : null}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="a2-btn"
                    onClick={() => setOpen(false)}
                  >
                    {x.cancel}
                  </button>
                  <button
                    type="button"
                    className="a2-btn pri"
                    data-ok
                    onClick={() => void send(true)}
                    disabled={busy}
                    aria-busy={busy || undefined}
                    data-testid={`${testId}-ok`}
                  >
                    {busy ? x.working : x.save}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
