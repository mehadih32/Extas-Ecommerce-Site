// S28 · PR 690 (admin prototype v5) — scheduled report packs. Each live store with an enabled pack schedule that is due today
// (weekly on Monday, monthly on the 1st; shop time) gets one run per pack and period (the period is in the payload and the run
// key, so the worker looking every tick sends it once). The run sends the owner a short Telegram summary of the period's sales
// and net profit (the mock until the bot's key is entered) and notes `lastSentAt`. Read-only; never to a buyer or supplier.
// The PDF and spreadsheet of a pack are downloaded on Reports › Report packs.
import { sendOwnerAlert } from '@extas/adapters';
import { periodRange, scheduleDue, PACK_IDS, type ScheduleFrequency } from '@extas/catalogue';
import { profitReport } from '@extas/inventory';
import { nowOf, type JobDeps } from './context';
import { runKey, textSlot } from './keys';
import type { Planner } from './worker';

export const REPORT_PACK_JOB = 'reports.pack.send';
export const REPORT_PACK_QUEUE = 'reports';

export interface ReportPackPayload {
  storeId: number;
  pack: string;
  period: string;
}

const dayIn = (now: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const reportPackPlanner: Planner = async (deps, now) => {
  const rows = await deps.db.reportSchedule.findMany({ where: { enabled: true, reportKey: { startsWith: 'pack:' } }, select: { storeId: true, reportKey: true, frequency: true, channels: true } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const r of rows) {
    if (!r.channels.includes('telegram')) continue;
    const tz = await deps.settings.value('store.timeZone', { storeId: r.storeId });
    const period = scheduleDue(r.frequency as ScheduleFrequency, dayIn(now, tz));
    const pack = r.reportKey.slice(5);
    if (!period || !(PACK_IDS as readonly string[]).includes(pack)) continue;
    const payload = { storeId: r.storeId, pack, period };
    out.push({ queue: REPORT_PACK_QUEUE, name: REPORT_PACK_JOB, payload, key: runKey(REPORT_PACK_JOB, payload, textSlot(`${pack}:${period}`)) });
  }
  return out;
};

export async function runReportPack(deps: JobDeps, p: ReportPackPayload): Promise<{ sent: boolean; reason?: string }> {
  const at = { storeId: p.storeId };
  const row = await deps.db.reportSchedule.findUnique({ where: { storeId_reportKey: { storeId: p.storeId, reportKey: `pack:${p.pack}` } } });
  if (!row || !row.enabled || !row.channels.includes('telegram')) return { sent: false, reason: 'off' };
  if (!deps.owner) return { sent: false, reason: 'no-telegram' };
  const tz = await deps.settings.value('store.timeZone', at);
  if (row.lastSentAt && dayIn(row.lastSentAt, tz) === dayIn(nowOf(deps), tz)) return { sent: false, reason: 'already' };
  const currency = await deps.settings.value('store.currency', at);
  const r = periodRange(p.pack === 'stock' || p.pack === 'sales' ? 'last30' : 'lastmonth', dayIn(nowOf(deps), tz));
  const report = await profitReport({ db: deps.db, settings: deps.settings }, p.storeId, r.from, r.to);
  const money = (n: number) => `${currency} ${(n / 100).toFixed(2)}`;
  const text = `Report pack: ${p.pack}\n${r.from} to ${r.to}\nSales ${money(report.salesMinor)}\nNet profit ${report.netProfitMinor === null ? 'not known yet' : money(report.netProfitMinor)}\nOpen Reports > Report packs for the PDF.`;
  const sent = await sendOwnerAlert(deps.owner.telegram, text);
  if (!sent.ok) throw new Error(`telegram: ${'error' in sent ? String(sent.error) : 'not sent'}`);
  await deps.db.reportSchedule.update({ where: { id: row.id }, data: { lastSentAt: nowOf(deps) } });
  return { sent: true };
}
