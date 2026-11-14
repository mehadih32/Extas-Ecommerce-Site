// S15 · PR 578 (C10.4; demo 89b-admin-agents.js) — daily/weekly/monthly/yearly reports per agent, generated from
// the facts already on file (the agent cannot edit them; it only ever reads them back): `AiWorkLog` (PR 577's own
// work-log table — tasks, bugs and rewards, keyed by `outcome`) for what it did and found, and `AiUsageLedger`
// (PR 315) for cost. No migration: `AiAppraisal` has been in the full S00 schema skeleton since it was written,
// tagged for this exact PR, unused until now.
//
// Periods are rolling windows ending now (1/7/30/365 days), the same shape every other report in this codebase
// uses (Reports › Customers' 7/30/90, Reports › Shopper analytics' 1/7/30) rather than calendar weeks/months/years
// — simpler, and consistent with the rest of the admin, not a narrower reading of the Blueprint's "Friday"/"month"
// wording.
//
// Two new `AiWorkLog.outcome` values are introduced here (beyond PR 577's own `'reward'`): `'bug_self'` (the agent
// found its own bug) and `'bug_owner'` (the owner found it) — nothing writes either yet (no job runner exists,
// same honest gap PR 306–310 already note for cost), so every KPI below reads truthfully as zero/`null` until a
// later PR's job runner starts logging real work. `firstTimeRightRate` is `null`, not `0` or `100`, while there is
// nothing to divide — CLAUDE.md "never invent a number".
//
// The Yearly appraisal's multinational-style sections (`docs/agents/APPRAISAL-TEMPLATE.md` §5) need the curriculum
// (PR 579) and the owner's own ratings (`AiAppraisal.ratings`, filled by a later screen) — both left as an honest
// "not yet" line in the generated report text rather than invented content; what this PR CAN build honestly from
// what already exists (role & scope from the agent's own docs file, the work-log history) is built.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { dayStart, ymdIn } from '@extas/metrics';
import { AI_AGENTS, aiAgentDef, isAiAgentKey, type AiAgentKey } from './agents';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';

export const APPRAISAL_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type AppraisalPeriod = (typeof APPRAISAL_PERIODS)[number];
export function isAppraisalPeriod(v: string): v is AppraisalPeriod {
  return (APPRAISAL_PERIODS as readonly string[]).includes(v);
}

const PERIOD_DAYS: Record<AppraisalPeriod, number> = { daily: 1, weekly: 7, monthly: 30, yearly: 365 };
const BUG_SELF = 'bug_self';
const BUG_OWNER = 'bug_owner';
const REWARD = 'reward'; // a plain task (no bug either way) has `outcome: null`

export interface AppraisalRange {
  /** The calendar day the window starts on (inclusive), store-timezone, `YYYY-MM-DD`. */
  periodStart: string;
  /** The calendar day it was generated for (inclusive), `YYYY-MM-DD` — "today" for every period. */
  periodEnd: string;
  from: Date;
  to: Date;
}

/** The [from, to) window for one period, ending now, in the store's own time zone — pure, so it is unit-tested
 * without touching the database. */
export function appraisalRange(period: AppraisalPeriod, now: Date, timeZone: string): AppraisalRange {
  const to = now;
  const todayYmd = ymdIn(now, timeZone);
  const fromYmd = ymdIn(new Date(now.getTime() - (PERIOD_DAYS[period] - 1) * 86_400_000), timeZone);
  return { periodStart: fromYmd, periodEnd: todayYmd, from: dayStart(fromYmd, timeZone), to };
}

export interface AppraisalKpis {
  tasksDone: number;
  bugsSelfFound: number;
  bugsOwnerFound: number;
  rewards: number;
  costMinor: number;
  /** `(tasksDone - bugsOwnerFound) / tasksDone` as a whole percent, or `null` while `tasksDone` is 0 — nothing to
   * divide, never a guessed rate. */
  firstTimeRightRate: number | null;
  /** PR 585: how many of Tirondaj/Doot's own practice tasks (`AiPracticeTask`) were graded (done or missed, never
   * still-open) in this window, and how many of those graded `pass`. Honestly 0 for every other agent — practice
   * tasks are structurally the learning engine's own, never invented for an agent that has none. */
  practiceTasksGraded: number;
  practiceTasksPassed: number;
}

const EMPTY_KPIS: AppraisalKpis = { tasksDone: 0, bugsSelfFound: 0, bugsOwnerFound: 0, rewards: 0, costMinor: 0, firstTimeRightRate: null, practiceTasksGraded: 0, practiceTasksPassed: 0 };

/** One agent's KPIs over a window — pure arithmetic over rows the caller already read, so the math is unit-tested
 * without a database. `practiceTasks` is optional so every earlier caller (PR 578's own tests included) keeps
 * working unchanged and still honestly reads 0/0 for an agent with none. */
export function kpisFromRows(workLog: readonly { outcome: string | null }[], costMinor: number, practiceTasks: readonly { grade: string | null }[] = []): AppraisalKpis {
  let bugsSelfFound = 0;
  let bugsOwnerFound = 0;
  let rewards = 0;
  for (const w of workLog) {
    if (w.outcome === BUG_SELF) bugsSelfFound++;
    else if (w.outcome === BUG_OWNER) bugsOwnerFound++;
    else if (w.outcome === REWARD) rewards++;
  }
  const tasksDone = workLog.length - rewards;
  const firstTimeRightRate = tasksDone > 0 ? Math.round(((tasksDone - bugsOwnerFound) / tasksDone) * 100) : null;
  const practiceTasksPassed = practiceTasks.filter((p) => p.grade === 'pass').length;
  return { tasksDone, bugsSelfFound, bugsOwnerFound, rewards, costMinor, firstTimeRightRate, practiceTasksGraded: practiceTasks.length, practiceTasksPassed };
}

export interface AppraisalDeps {
  db: PrismaClient;
  now?: () => Date;
}

/** Reads the facts and computes one agent's KPIs for a period — the read side `generateAppraisal` writes from. */
export async function computeAppraisalKpis(deps: AppraisalDeps, key: AiAgentKey, period: AppraisalPeriod, timeZone: string): Promise<{ range: AppraisalRange; kpis: AppraisalKpis }> {
  const now = deps.now?.() ?? new Date();
  const range = appraisalRange(period, now, timeZone);
  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!agent) return { range, kpis: EMPTY_KPIS };
  const [workLog, usage, practiceTasks] = await Promise.all([
    deps.db.aiWorkLog.findMany({ where: { agentId: agent.id, createdAt: { gte: range.from, lte: range.to } }, select: { outcome: true } }),
    deps.db.aiUsageLedger.aggregate({ where: { agentId: agent.id, createdAt: { gte: range.from, lte: range.to } }, _sum: { costMinor: true } }),
    // PR 585: Tirondaj/Doot's own practice tasks are keyed by the plain agent key, not `agentId` (AiPracticeTask has
    // no FK — the same plain-key shape AiLearningSource/AiLearningTip already use); harmlessly empty for any other
    // agent, since none of theirs ever exist.
    deps.db.aiPracticeTask.findMany({ where: { agentKey: key, status: { not: 'open' }, updatedAt: { gte: range.from, lte: range.to } }, select: { grade: true } }),
  ]);
  return { range, kpis: kpisFromRows(workLog, usage._sum.costMinor ?? 0, practiceTasks) };
}

/** The honest Bengali report text for one period — every figure in it came from `kpis`, nothing guessed; the parts
 * that genuinely are not ready yet (yearly's competencies, curriculum, owner rating) say so plainly instead of
 * being left blank or invented. */
export function appraisalReportText(period: AppraisalPeriod, kpis: AppraisalKpis, role: string, range: AppraisalRange): string {
  const rate = kpis.firstTimeRightRate === null ? 'তথ্য নেই' : `${kpis.firstTimeRightRate}%`;
  const lines: string[] = [];
  lines.push(`সময়কাল: ${range.periodStart} – ${range.periodEnd}`);
  lines.push(`কাজ শেষ: ${kpis.tasksDone} · নিজে ধরা বাগ: ${kpis.bugsSelfFound} · মালিক ধরা বাগ: ${kpis.bugsOwnerFound} · পুরস্কার: ${kpis.rewards}`);
  lines.push(`প্রথমবারেই ঠিক হওয়ার হার: ${rate} · খরচ: ${kpis.costMinor} পয়সা`);
  if (kpis.practiceTasksGraded > 0) lines.push(`প্র্যাকটিস টাস্ক: ${kpis.practiceTasksGraded}টা গ্রেড হয়েছে, ${kpis.practiceTasksPassed}টা পাস`);
  if (period === 'yearly') {
    lines.push(`দায়িত্ব: ${role}`);
    lines.push('যোগ্যতা, কারিকুলাম আর মালিকের রেটিং এখনো ভরা হয়নি — সেগুলো PR 579 (কারিকুলাম) আর মালিকের নিজের রেটিং পাতা থেকে আসবে।');
  }
  if (kpis.tasksDone === 0 && kpis.rewards === 0) lines.push('এই সময়ে কোনো কাজ রেকর্ড হয়নি — এখনো কোনো জব-রানার কাজ লেখেনি, তাই সংখ্যা সৎভাবে শূন্য।');
  return lines.join('\n');
}

export interface AppraisalRow {
  id: string;
  key: AiAgentKey;
  period: AppraisalPeriod;
  periodStart: string;
  periodEnd: string;
  kpis: AppraisalKpis;
  report: string;
  createdAt: string;
  updatedAt: string;
}

function rowOf(key: AiAgentKey, r: { id: string; period: string; periodStart: Date; periodEnd: Date; kpis: Prisma.JsonValue; report: string; createdAt: Date; updatedAt: Date }): AppraisalRow {
  return {
    id: r.id,
    key,
    period: r.period as AppraisalPeriod,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    periodEnd: r.periodEnd.toISOString().slice(0, 10),
    kpis: r.kpis as unknown as AppraisalKpis,
    report: r.report,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Generates (or regenerates) one agent's appraisal for a period and saves it — idempotent by
 * `(agentId, period, periodStart)`, so running it twice for the same window just refreshes the same row with the
 * latest facts rather than piling up duplicates. */
export async function generateAppraisal(deps: AppraisalDeps, key: string, period: string, timeZone: string): Promise<AppraisalRow> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  if (!isAppraisalPeriod(period)) throw new AiError(422, 'INVALID_INPUT', ['period']);
  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!agent) throw new AiError(404, 'NOT_FOUND', ['key']);
  const { range, kpis } = await computeAppraisalKpis(deps, key, period, timeZone);
  const report = appraisalReportText(period, kpis, aiAgentDef(key).role, range);
  const periodStartDate = dayStart(range.periodStart, timeZone);
  const periodEndDate = dayStart(range.periodEnd, timeZone);
  const saved = await deps.db.aiAppraisal.upsert({
    where: { agentId_period_periodStart: { agentId: agent.id, period, periodStart: periodStartDate } },
    create: { agentId: agent.id, period, periodStart: periodStartDate, periodEnd: periodEndDate, kpis: kpis as unknown as Prisma.InputJsonValue, report },
    update: { periodEnd: periodEndDate, kpis: kpis as unknown as Prisma.InputJsonValue, report },
  });
  return rowOf(key, saved);
}

/** The most recent saved appraisals of one agent, newest first — read-only, no generation. */
export async function appraisalHistory(deps: Pick<AppraisalDeps, 'db'>, key: string, period?: string, take = 12): Promise<AppraisalRow[]> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  if (period !== undefined && !isAppraisalPeriod(period)) throw new AiError(422, 'INVALID_INPUT', ['period']);
  const agent = await deps.db.aiAgent.findUnique({ where: { key } });
  if (!agent) return [];
  const rows = await deps.db.aiAppraisal.findMany({ where: { agentId: agent.id, ...(period ? { period } : {}) }, orderBy: { periodStart: 'desc' }, take });
  return rows.map((r) => rowOf(key as AiAgentKey, r));
}

/** Every fixed agent's own name, for the report screen's agent picker (the same seven cards the Control room uses). */
export function appraisalAgentOptions(): { key: AiAgentKey; nameEn: string; nameBn: string; emoji: string }[] {
  return AI_AGENTS.map((a) => ({ key: a.key, nameEn: a.nameEn, nameBn: a.nameBn, emoji: a.emoji }));
}
