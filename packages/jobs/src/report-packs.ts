// S28 · PR 690 (admin prototype v5) — scheduled report packs. Each live store with an enabled pack schedule that is due today
// (weekly on Monday, monthly on the 1st; shop time) gets one run per pack and period (the period is in the payload and the run
// key, so the worker looking every tick sends it once). The run sends the owner a short summary of the period's sales and net
// profit by Telegram (the mock until the bot's key is entered) and, when asked for, by e-mail to the owner's own address
// (`reports.digest.ownerEmail`, empty until he types it; the mock sender until an e-mail key is entered), and notes
// `lastSentAt`. Read-only; never to a buyer or supplier.
// The PDF and spreadsheet of a pack are downloaded on Reports › Report packs.
import { sendOwnerAlert } from "@extas/adapters";
import {
  dailyDue,
  DAILY_PACK,
  periodRange,
  scheduleDue,
  PACK_IDS,
  REPORT_SCHEDULE_KEY,
  type ScheduleFrequency,
} from "@extas/catalogue";
import { profitReport } from "@extas/inventory";
import { nowOf, type JobDeps } from "./context";
import { runKey, textSlot } from "./keys";
import type { Planner } from "./worker";

export const REPORT_PACK_JOB = "reports.pack.send";
export const REPORT_PACK_QUEUE = "reports";

export interface ReportPackPayload {
  storeId: number;
  pack: string;
  period: string;
}

const dayIn = (now: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

export const reportPackPlanner: Planner = async (deps, now) => {
  const rows = await deps.db.reportSchedule.findMany({
    where: {
      enabled: true,
      OR: [
        { reportKey: { startsWith: "pack:" } },
        { reportKey: { startsWith: REPORT_SCHEDULE_KEY } },
      ],
    },
    select: {
      storeId: true,
      reportKey: true,
      frequency: true,
      channels: true,
      recipients: true,
    },
  });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const r of rows) {
    if (!r.channels.includes("telegram") && !r.channels.includes("email"))
      continue;
    const tz = await deps.settings.value("store.timeZone", {
      storeId: r.storeId,
    });
    // PR 854: a report's own schedule (`report:<tab>`) keeps its whole key in the payload; a pack's is the part after `pack:`
    const ownReport = r.reportKey.startsWith(REPORT_SCHEDULE_KEY);
    const pack = ownReport ? r.reportKey : r.reportKey.slice(5);
    // The daily business report goes every night from the owner's hour on the shop clock, once a day (the run key holds the day).
    const time = (r.recipients as { time?: unknown } | null)?.time;
    const hm = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    if (
      pack === DAILY_PACK &&
      !dailyDue(typeof time === "string" ? time : "22:00", hm)
    )
      continue; // hardcode-ok: the prototype's first hour
    if (ownReport && !dailyDue(typeof time === "string" ? time : "09:00", hm))
      continue; // hardcode-ok: the prototype's first hour
    const period = scheduleDue(
      r.frequency as ScheduleFrequency,
      dayIn(now, tz),
    );
    if (
      !period ||
      !(
        ownReport ||
        pack === DAILY_PACK ||
        (PACK_IDS as readonly string[]).includes(pack)
      )
    )
      continue;
    const payload = { storeId: r.storeId, pack, period };
    out.push({
      queue: REPORT_PACK_QUEUE,
      name: REPORT_PACK_JOB,
      payload,
      key: runKey(REPORT_PACK_JOB, payload, textSlot(`${pack}:${period}`)),
    });
  }
  return out;
};

export async function runReportPack(
  deps: JobDeps,
  p: ReportPackPayload,
): Promise<{ sent: boolean; reason?: string }> {
  const at = { storeId: p.storeId };
  const row = await deps.db.reportSchedule.findUnique({
    where: {
      storeId_reportKey: {
        storeId: p.storeId,
        reportKey: p.pack.startsWith(REPORT_SCHEDULE_KEY)
          ? p.pack
          : `pack:${p.pack}`,
      },
    },
  });
  const byTelegram = !!row?.channels.includes("telegram");
  const byEmail = !!row?.channels.includes("email");
  if (!row || !row.enabled || (!byTelegram && !byEmail))
    return { sent: false, reason: "off" };
  const ownerEmail =
    byEmail && deps.messages
      ? await deps.settings.value("reports.digest.ownerEmail", at)
      : null;
  if (!(byTelegram && deps.owner) && !ownerEmail)
    return { sent: false, reason: byTelegram ? "no-telegram" : "no-email" };
  const tz = await deps.settings.value("store.timeZone", at);
  if (row.lastSentAt && dayIn(row.lastSentAt, tz) === dayIn(nowOf(deps), tz))
    return { sent: false, reason: "already" };
  const currency = await deps.settings.value("store.currency", at);
  const daily = p.pack === DAILY_PACK;
  const own = p.pack.startsWith(REPORT_SCHEDULE_KEY);
  // PR 854: a report's own schedule sends the span it repeats over (a day, the last 7 days, last month)
  const span = own
    ? row.frequency === "daily"
      ? "today"
      : row.frequency === "weekly"
        ? "last7"
        : "lastmonth"
    : daily
      ? "today"
      : p.pack === "stock" || p.pack === "sales"
        ? "last30"
        : "lastmonth";
  const r = periodRange(span, dayIn(nowOf(deps), tz));
  const report = await profitReport(
    { db: deps.db, settings: deps.settings },
    p.storeId,
    r.from,
    r.to,
  );
  const money = (n: number) => `${currency} ${(n / 100).toFixed(2)}`;
  const figures = `Sales ${money(report.salesMinor)}\nNet profit ${report.netProfitMinor === null ? "not known yet" : money(report.netProfitMinor)}`;
  const waiting = daily
    ? await deps.db.order.count({
        where: {
          storeId: p.storeId,
          status: "PLACED",
          archivedAt: null,
          isPractice: false,
        },
      })
    : 0; // PR 725: a practice order never counts in a message to the owner
  const text = own
    ? `Report: ${p.pack.slice(REPORT_SCHEDULE_KEY.length)}\n${r.from} to ${r.to}\n${figures}\nOpen Reports for the full report (Excel, PDF).`
    : daily
      ? `Daily business report\n${r.from}\n${figures}\nOrders waiting for confirmation: ${waiting}\nOpen Reports > Downloads & report packs for the full PDF.`
      : `Report pack: ${p.pack}\n${r.from} to ${r.to}\n${figures}\nOpen Reports > Report packs for the PDF and the Excel file.`;
  let sent = false;
  if (byTelegram && deps.owner) {
    const t = await sendOwnerAlert(deps.owner.telegram, text);
    if (!t.ok)
      throw new Error(
        `telegram: ${"error" in t ? String(t.error) : "not sent"}`,
      );
    sent = true;
  }
  if (ownerEmail && deps.messages) {
    const mail = await (
      await deps.messages.sender(p.storeId, "EMAIL")
    ).send({
      to: ownerEmail,
      subject: own
        ? `Report: ${p.pack.slice(REPORT_SCHEDULE_KEY.length)} (${r.from} to ${r.to})`
        : daily
          ? `Daily business report (${r.from})`
          : `Report pack: ${p.pack} (${r.from} to ${r.to})`,
      text,
      purpose: "report.pack",
    });
    if (!mail.ok) throw new Error(`email: ${mail.error}`);
    sent = true;
  }
  await deps.db.reportSchedule.update({
    where: { id: row.id },
    data: { lastSentAt: nowOf(deps) },
  });
  return { sent };
}
