// S28 · PR 690 (admin prototype v5, Reports › Report packs) — when a pack goes to the owner by itself. One row per pack and store
// (`ReportSchedule`, reportKey `pack:<id>`): weekly (Monday) or monthly (the 1st), the channels asked for, and a switch (off as
// shipped). The nightly job sends a short Telegram summary of the period to the owner when a schedule is due, once per period
// (`lastSentAt`). The PDF and spreadsheet are downloaded on the page; e-mail is stored as a wish but not sent yet.
// Never sends to a buyer or a supplier. Needs `reports.read` (a pack is the person's own convenience).
import { requirePermission } from "@extas/auth";
import { z } from "zod";
import { CatalogueError } from "./errors";
import { parse, type CatalogueDeps, type Who } from "./context";

export const PACK_IDS = ["monthly", "bank", "stock", "sales"] as const;
export const SCHEDULE_FREQUENCIES = ["weekly", "monthly"] as const;
export const SCHEDULE_CHANNELS = ["telegram", "email"] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number] | "daily";

/** S28 · PR 689/690: the daily business report is a schedule row of its own (`pack:daily`, frequency `daily`, its time in `recipients`). */
export const DAILY_PACK = "daily";
/** The shop-clock time it goes at, "HH:MM". */
export const DAILY_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whether the report is due: its time has come on the shop's clock today (both "HH:MM"). */
export function dailyDue(time: string, nowHm: string): boolean {
  return DAILY_TIME_PATTERN.test(time) && nowHm >= time;
}

const input = z
  .object({
    pack: z.enum(PACK_IDS),
    frequency: z.enum(SCHEDULE_FREQUENCIES),
    channels: z.array(z.enum(SCHEDULE_CHANNELS)).max(2),
    enabled: z.boolean(),
  })
  .strict();
export type SaveScheduleInput = z.input<typeof input>;

export interface ScheduleRow {
  pack: (typeof PACK_IDS)[number];
  frequency: ScheduleFrequency;
  channels: string[];
  enabled: boolean;
  lastSentAt: string | null;
}

const KEY = "pack:";

/** The period a schedule is due for now, or null: weekly on Monday (key `W:<that Monday>`), monthly on the 1st (key `M:<month>`), shop time. */
export function scheduleDue(
  frequency: ScheduleFrequency,
  today: string,
): string | null {
  if (frequency === "daily") return `D:${today}`;
  const d = new Date(`${today}T00:00:00Z`);
  if (frequency === "weekly") return d.getUTCDay() === 1 ? `W:${today}` : null;
  return today.endsWith("-01") ? `M:${today.slice(0, 7)}` : null;
}

/** The schedule of each pack (those never saved are off). */
export async function listSchedules(
  deps: CatalogueDeps,
  who: Who,
): Promise<ScheduleRow[]> {
  await requirePermission(deps.db, who.actor, "reports.read", {
    storeId: who.storeId,
  });
  const rows = await deps.db.reportSchedule.findMany({
    where: { storeId: who.storeId, reportKey: { startsWith: KEY } },
  });
  const by = new Map(rows.map((r) => [r.reportKey.slice(KEY.length), r]));
  return PACK_IDS.map((pack) => {
    const r = by.get(pack);
    return {
      pack,
      frequency: (r?.frequency as ScheduleFrequency | undefined) ?? "monthly",
      channels: r?.channels ?? ["telegram"],
      enabled: r?.enabled ?? false,
      lastSentAt: r?.lastSentAt?.toISOString() ?? null,
    };
  });
}

/** Saves one pack's schedule. */
export async function saveSchedule(
  deps: CatalogueDeps,
  who: Who,
  raw: SaveScheduleInput,
): Promise<ScheduleRow[]> {
  await requirePermission(deps.db, who.actor, "reports.read", {
    storeId: who.storeId,
  });
  const d = parse(input, raw, "schedule");
  if (d.enabled && d.channels.length === 0)
    throw new CatalogueError("INVALID_INPUT", "pick where it goes", [
      "channels",
    ]);
  const key = `${KEY}${d.pack}`;
  await deps.db.reportSchedule.upsert({
    where: { storeId_reportKey: { storeId: who.storeId, reportKey: key } },
    create: {
      storeId: who.storeId,
      reportKey: key,
      frequency: d.frequency,
      channels: d.channels,
      enabled: d.enabled,
    },
    update: {
      frequency: d.frequency,
      channels: d.channels,
      enabled: d.enabled,
    },
  });
  return listSchedules(deps, who);
}

export interface DailyReportRow {
  enabled: boolean;
  time: string;
  channels: string[];
  lastSentAt: string | null;
}

const dailyInput = z
  .object({
    enabled: z.boolean(),
    time: z.string().regex(DAILY_TIME_PATTERN),
    channels: z.array(z.enum(SCHEDULE_CHANNELS)).max(2),
  })
  .strict();
export type SaveDailyReportInput = z.input<typeof dailyInput>;

/** Off as shipped; it goes to the owner's Telegram first, at 22:00 shop time until he picks another hour. */
export async function dailyReport(
  deps: CatalogueDeps,
  who: Who,
): Promise<DailyReportRow> {
  await requirePermission(deps.db, who.actor, "reports.read", {
    storeId: who.storeId,
  });
  const r = await deps.db.reportSchedule.findUnique({
    where: {
      storeId_reportKey: {
        storeId: who.storeId,
        reportKey: `${KEY}${DAILY_PACK}`,
      },
    },
  });
  const t = (r?.recipients as { time?: unknown } | null)?.time;
  return {
    enabled: r?.enabled ?? false,
    time: typeof t === "string" && DAILY_TIME_PATTERN.test(t) ? t : "22:00",
    channels: r?.channels ?? ["telegram"],
    lastSentAt: r?.lastSentAt?.toISOString() ?? null,
  }; // hardcode-ok: the prototype's first hour, editable
}

/** Saves the daily business report's switch, hour and channels. */
export async function saveDailyReport(
  deps: CatalogueDeps,
  who: Who,
  raw: SaveDailyReportInput,
): Promise<DailyReportRow> {
  await requirePermission(deps.db, who.actor, "reports.read", {
    storeId: who.storeId,
  });
  const d = parse(dailyInput, raw, "daily report");
  if (d.enabled && d.channels.length === 0)
    throw new CatalogueError("INVALID_INPUT", "pick where it goes", [
      "channels",
    ]);
  const reportKey = `${KEY}${DAILY_PACK}`;
  await deps.db.reportSchedule.upsert({
    where: { storeId_reportKey: { storeId: who.storeId, reportKey } },
    create: {
      storeId: who.storeId,
      reportKey,
      frequency: "daily",
      channels: d.channels,
      enabled: d.enabled,
      recipients: { time: d.time },
    },
    update: {
      frequency: "daily",
      channels: d.channels,
      enabled: d.enabled,
      recipients: { time: d.time },
    },
  });
  return dailyReport(deps, who);
}

// ---- PR 854 (prototype v5): "Schedule" on one report ------------------------------------------------------------------------------
// The prototype's Schedule button opens a small box on every report: Telegram and/or e-mail, how often (every day, every Monday, the
// 1st of the month) and at what hour. One row per report and store (`ReportSchedule`, reportKey `report:<tab>`, the hour in
// `recipients`); no new table. Off as shipped. The nightly job (packages/jobs report-packs.ts) sends the owner a short summary once per
// period; never a buyer or a supplier.
export const REPORT_SCHEDULE_KEY = "report:";
export const REPORT_SCHEDULE_FREQUENCIES = [
  "daily",
  "weekly",
  "monthly",
] as const;
/** The hours the box offers (the prototype's own list); the server takes any "HH:MM". */
export const REPORT_SCHEDULE_TIMES = [
  "08:00",
  "09:00",
  "10:00",
  "18:00",
  "21:00",
] as const;
const REPORT_NAME = /^[a-z][a-z0-9-]{1,39}$/;

const reportScheduleInput = z
  .object({
    report: z.string().regex(REPORT_NAME),
    frequency: z.enum(REPORT_SCHEDULE_FREQUENCIES),
    time: z.string().regex(DAILY_TIME_PATTERN),
    channels: z.array(z.enum(SCHEDULE_CHANNELS)).max(2),
    enabled: z.boolean(),
  })
  .strict();
export type SaveReportScheduleInput = z.input<typeof reportScheduleInput>;

export interface ReportScheduleRow {
  report: string;
  enabled: boolean;
  frequency: (typeof REPORT_SCHEDULE_FREQUENCIES)[number];
  time: string;
  channels: string[];
  lastSentAt: string | null;
}

const rowOf = (
  report: string,
  r: {
    frequency: string;
    channels: string[];
    enabled: boolean;
    recipients: unknown;
    lastSentAt: Date | null;
  } | null,
): ReportScheduleRow => {
  const t = (r?.recipients as { time?: unknown } | null)?.time;
  const f = (REPORT_SCHEDULE_FREQUENCIES as readonly string[]).includes(
    r?.frequency ?? "",
  )
    ? (r!.frequency as ReportScheduleRow["frequency"])
    : "weekly";
  return {
    report,
    enabled: r?.enabled ?? false,
    frequency: f,
    time: typeof t === "string" && DAILY_TIME_PATTERN.test(t) ? t : "09:00", // hardcode-ok: the prototype's first hour, editable
    channels: r?.channels ?? ["telegram"],
    lastSentAt: r?.lastSentAt?.toISOString() ?? null,
  };
};

/** One report's schedule (never saved = off, weekly at 09:00 to Telegram). */
export async function reportSchedule(
  deps: CatalogueDeps,
  who: Who,
  report: string,
): Promise<ReportScheduleRow> {
  await requirePermission(deps.db, who.actor, "reports.read", {
    storeId: who.storeId,
  });
  if (!REPORT_NAME.test(report))
    throw new CatalogueError("INVALID_INPUT", "unknown report", ["report"]);
  const r = await deps.db.reportSchedule.findUnique({
    where: {
      storeId_reportKey: {
        storeId: who.storeId,
        reportKey: `${REPORT_SCHEDULE_KEY}${report}`,
      },
    },
  });
  return rowOf(report, r);
}

/** Saves one report's schedule (turning it off keeps the hour and the channels). */
export async function saveReportSchedule(
  deps: CatalogueDeps,
  who: Who,
  raw: SaveReportScheduleInput,
): Promise<ReportScheduleRow> {
  await requirePermission(deps.db, who.actor, "reports.read", {
    storeId: who.storeId,
  });
  const d = parse(reportScheduleInput, raw, "report schedule");
  if (d.enabled && d.channels.length === 0)
    throw new CatalogueError("INVALID_INPUT", "pick where it goes", [
      "channels",
    ]);
  const reportKey = `${REPORT_SCHEDULE_KEY}${d.report}`;
  const data = {
    frequency: d.frequency,
    channels: d.channels,
    enabled: d.enabled,
    recipients: { time: d.time },
  };
  await deps.db.reportSchedule.upsert({
    where: { storeId_reportKey: { storeId: who.storeId, reportKey } },
    create: { storeId: who.storeId, reportKey, ...data },
    update: data,
  });
  return reportSchedule(deps, who, d.report);
}
