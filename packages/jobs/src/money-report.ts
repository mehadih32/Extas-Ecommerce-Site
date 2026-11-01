// S16 · PR 351 (B3.10, §59 answer 24) — the money report to the owner (`money.report`, off as shipped): each live store
// whose report is due now (daily, weekly or monthly at the owner's time, store time; @extas/inventory money-report.ts)
// gets one run per period — the period is in the payload and the run key, so the worker looking every tick sends it
// once. The run reads the period's Profit & loss (the same figure as the admin page) and sends its words to the owner's
// Telegram (the mock until the bot's key is entered). Read-only: nothing moves money.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { sendOwnerAlert } from '@extas/adapters';
import { moneyReportDue, moneyReportText, profitReport } from '@extas/inventory';
import { nowOf, type JobDeps } from './context';
import { runKey } from './keys';
import type { Planner } from './worker';

export const MONEY_REPORT_JOB = 'money.report.send';
export const MONEY_REPORT_QUEUE = 'reports';

export interface MoneyReportPayload {
  storeId: number;
  /** The period key: `D:2026-11-01`, `W:2026-11-07`, `M:2026-10`. */
  period: string;
}

/** Each live store whose money report is due now: one run per period. */
export const moneyReportPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const st of stores) {
    const at = { storeId: st.id };
    const [s, tz] = await Promise.all([deps.settings.value('money.report', at), deps.settings.value('store.timeZone', at)]);
    const due = moneyReportDue(now, tz, s);
    if (!due) continue;
    const payload = { storeId: st.id, period: due.key };
    out.push({ queue: MONEY_REPORT_QUEUE, name: MONEY_REPORT_JOB, payload, key: runKey(MONEY_REPORT_JOB, payload, 0) });
  }
  return out;
};

/** Sends one store's report for its period, when it is still due for that period (switched off since = nothing). */
export async function runMoneyReport(deps: JobDeps, p: MoneyReportPayload): Promise<{ sent: boolean; reason?: string; mode?: string }> {
  const at = { storeId: p.storeId };
  const [s, tz, currency] = await Promise.all([deps.settings.value('money.report', at), deps.settings.value('store.timeZone', at), deps.settings.value('store.currency', at)]);
  const due = moneyReportDue(nowOf(deps), tz, s);
  if (!due || due.key !== p.period) return { sent: false, reason: 'not-due' };
  if (!deps.owner) return { sent: false, reason: 'no-telegram' };
  const report = await profitReport({ db: deps.db, settings: deps.settings }, p.storeId, due.from, due.to);
  const r = await sendOwnerAlert(deps.owner.telegram, moneyReportText(report, due, s.lang, currency));
  if (!r.ok) throw new Error(`telegram: ${'error' in r ? String(r.error) : 'not sent'}`);
  return { sent: true, mode: r.mode };
}
