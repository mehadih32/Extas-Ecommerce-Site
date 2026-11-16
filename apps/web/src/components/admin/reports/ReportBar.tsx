// S28 · PR 714-717 — the toolbar of the v5 report pages (server component). Round 3 (prototype v5 parity): ONE card like the
// prototype's — the period buttons (Today, 7 days, 30 days, This month, Last month, 6 months, Custom dates), the compare switch, the
// period line, then Saved views / Save view and Excel, PDF, Print, Report packs, Schedule. Two own dates open under "Custom dates".
// Excel is the report's CSV (opens in Excel); PDF and Print use the browser's print box; Report packs opens Reports › Report packs.
// PR 854: Schedule opens the prototype's own box (Telegram / e-mail, how often, hour) for THIS report (ScheduleButton).
import Link from "next/link";
import type { ReactNode } from "react";
import { PeriodSelect } from "./PeriodSelect";
import { PrintButton } from "./PrintButton";
import { ReportViews, type ViewOption } from "./ReportViews";
import { ScheduleButton, type ScheduleTexts } from "./ScheduleButton";
import { addDays } from "@/lib/reports-v5/model";
import {
  PRESET_OF,
  PROTO_PERIODS,
  protoKey,
  protoRange,
  type ProtoPeriod,
} from "@/lib/reports-v5/period";
import type { SavedView } from "@/lib/reports-v5/load";
import { t, type Dict } from "@/lib/i18n";
import "./report-bar.css";

export interface ReportBarProps {
  dict: Dict;
  here: string;
  /** The testid prefix (pl, pr, mk). */
  id: string;
  from: string;
  to: string;
  today: string;
  /** Kept for the pages that still pass it; the button shown is worked out from the two days (or `p`). */
  current?: unknown;
  csv: string;
  notes: readonly string[];
  limitDays: number;
  /** `p=` of the address (a button's own key). */
  p?: string;
  /** Compare with the span before (default on; `cmp=0` turns it off). */
  cmp?: boolean;
  /** The span before, for the period line. */
  before?: { from: string; to: string };
  /** The report's key for saved views (the tab's name). */
  reportKey?: string;
  views?: readonly SavedView[] | null;
  /** Day text for the period line. */
  day?: (ymd: string) => string;
  /** The report's filter selects (ReportFilters): drawn inside this card, in the row with Saved views (prototype v5). */
  filters?: ReactNode;
}

/** The words of the Schedule box (PR 863: the Monthly review page shows the same button beside its month switch). */
export function scheduleTexts(d: Dict): ScheduleTexts {
  const c = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.common.${k}`, v);
  const sc = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.common.sch.${k}`, v);
  return {
    button: c("schedule"),
    scheduled: c("scheduled"),
    title: sc("title"),
    intro: sc("intro", { name: "{name}" }),
    telegram: sc("telegram"),
    telegramSub: sc("telegramSub"),
    email: sc("email"),
    emailNone: sc("emailNone"),
    how: sc("how"),
    time: sc("time"),
    daily: sc("daily"),
    weekly: sc("weekly"),
    monthly: sc("monthly"),
    save: sc("save"),
    off: sc("off"),
    cancel: sc("cancel"),
    pick: sc("pick"),
    saved: sc("saved", { name: "{name}", when: "{when}" }),
    turnedOff: sc("turnedOff"),
    failed: sc("failed"),
    close: sc("close"),
    working: sc("working"),
  };
}

export function ReportBar({
  dict: d,
  here,
  id,
  from,
  to,
  today,
  csv,
  notes,
  limitDays,
  p,
  cmp = true,
  before,
  reportKey,
  views,
  day,
  filters,
}: ReportBarProps) {
  const c = (k: string, v?: Record<string, string | number>) =>
    t(d, `reportsV5.common.${k}`, v);
  const key = protoKey(p, from, to, today);
  const dayText = day ?? ((x: string) => x);
  const keep = cmp ? "" : "&cmp=0";
  const href = (k: ProtoPeriod) => {
    if (k === "custom") return `${here}?p=custom&from=${from}&to=${to}${keep}`;
    const r = protoRange(k, today);
    return `${here}?p=${k}&from=${r.from}&to=${r.to}${keep}`;
  };
  const toggle = `${here}?p=${key}&from=${from}&to=${to}${cmp ? "&cmp=0" : ""}`;
  const hrefOfView = (v: SavedView) => {
    const k =
      (Object.keys(PRESET_OF) as ProtoPeriod[]).find(
        (x) => PRESET_OF[x] === v.preset,
      ) ?? "d30";
    const r =
      k === "custom"
        ? { from: v.filters.from ?? from, to: v.filters.to ?? to }
        : protoRange(k, today);
    return `${here}?p=${k}&from=${r.from}&to=${r.to}${v.compare ? "" : "&cmp=0"}`;
  };
  const options: ViewOption[] = (views ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    href: hrefOfView(v),
  }));
  const prev = before ?? { from: addDays(from, -1), to: addDays(from, -1) };
  const named = t(d, `reportsV5.${reportKey}.metaTitle`);
  const schName =
    reportKey && named !== `reportsV5.${reportKey}.metaTitle`
      ? named
      : c("pageTitle");
  const schTexts = scheduleTexts(d);
  return (
    <section
      className="rpbar a2-card a2-mt12"
      data-testid={`${id}-bar`}
      aria-label={c("periodsLabel")}
    >
      <div className="rpbar-top">
        <nav
          className="rpseg"
          aria-label={c("periodsLabel")}
          data-testid={`${id}-quick`}
        >
          {PROTO_PERIODS.map((k) => (
            <Link
              key={k}
              href={href(k)}
              className={key === k ? "on" : ""}
              aria-current={key === k ? "true" : undefined}
              data-testid={`${id}-quick-${k}`}
            >
              {c(`p.${k}`)}
            </Link>
          ))}
        </nav>
        <PeriodSelect
          label={c("periodsLabel")}
          value={key}
          testId={`${id}-period-select`}
          options={PROTO_PERIODS.map((k) => ({ value: k, label: c(`p.${k}`), href: href(k) }))}
        />
        <Link
          href={toggle}
          className="rpsw"
          role="switch"
          aria-checked={cmp}
          data-testid={`${id}-compare`}
        >
          <i className={cmp ? "on" : ""} aria-hidden="true" />
          {c("compare")}
        </Link>
      </div>
      {key === "custom" ? (
        <form
          className="rpbar-dates"
          action={here}
          method="get"
          data-testid={`${id}-form`}
        >
          <input type="hidden" name="p" value="custom" />
          {cmp ? null : <input type="hidden" name="cmp" value="0" />}
          <input
            id={`${id}-from`}
            name="from"
            type="date"
            className="a2-inp"
            max={today}
            defaultValue={from}
            aria-label={t(d, "moneyCostReport.form.from")}
          />
          <span className="a2-mute">–</span>
          <input
            id={`${id}-to`}
            name="to"
            type="date"
            className="a2-inp"
            max={today}
            defaultValue={to}
            aria-label={t(d, "moneyCostReport.form.to")}
          />
          <button
            type="submit"
            className="a2-btn sm cr-tap"
            data-testid={`${id}-show`}
          >
            {c("show")}
          </button>
        </form>
      ) : null}
      <p className="rpbar-per" data-testid={`${id}-period`}>
        {dayText(from)} – {dayText(to)}
        {cmp
          ? ` · ${c("comparedWith", { from: dayText(prev.from), to: dayText(prev.to) })}`
          : ""}
      </p>
      {notes
        .filter((n) => n !== "byMonth")
        .map((n) => (
          <p key={n} className="a2-xs bk-warn" data-testid={`${id}-note-${n}`}>
            {c(`note.${n}`, { days: limitDays })}
          </p>
        ))}
      <div className="rpbar-2">
        {filters}
        {reportKey && views !== null ? (
          <ReportViews
            reportKey={reportKey}
            views={options}
            preset={PRESET_OF[key]}
            compare={cmp}
            filters={key === "custom" ? { from, to } : {}}
            canSave={views !== undefined}
            testId={id}
            texts={{
              saved: c("savedViews"),
              savedN: c("savedViewsN", { n: "{n}" }),
              save: c("saveView"),
              name: c("viewName"),
              done: c("viewSaved"),
              failed: c("viewFailed"),
            }}
          />
        ) : null}
      </div>
      <div className="rpbar-3">
        <span className="rpbar-btns">
          <a
            className="a2-btn sm cr-tap"
            href={csv}
            download
            data-testid={`${id}-csv`}
          >
            ↓ {c("excel")}
          </a>
          <PrintButton
            label={`↓ ${c("pdf")}`}
            testId={`${id}-pdf`}
            cls="a2-btn sm cr-tap"
          />
          <PrintButton
            label={c("print")}
            testId={`${id}-print`}
            cls="a2-btn sm ghost cr-tap"
          />
          <Link
            className="a2-btn sm cr-tap"
            href="/admin/reports/packs"
            data-testid={`${id}-packs`}
          >
            {c("packs")}
          </Link>
          {reportKey ? (
            <ScheduleButton
              report={reportKey}
              name={schName}
              texts={schTexts}
              testId={`${id}-schedule`}
            />
          ) : (
            <Link
              className="a2-btn sm cr-tap"
              href="/admin/reports/packs"
              data-testid={`${id}-schedule`}
            >
              {c("schedule")}
            </Link>
          )}
        </span>
      </div>
    </section>
  );
}
