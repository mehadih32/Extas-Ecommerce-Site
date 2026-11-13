// S15 · PR 320 (Blueprint C1.7's "bug box" — the demo's own AIC-09 "AI diary & bug box" segmented view, `syn:
// "diary log what agents did could not do bug box"`) — `AiDiaryEntry` (PR 319) covers "what each agent did"; this
// file covers the other half the same screen shows: what an agent *could not* do, and why. `AiBugReport` (already
// in the full S00 schema, `@stage S15 · PR 320`, written for the first time here) is the backing table, written to
// for the first time here.
//
// The demo's own mock (`97y-adm2-ai.js`) shows no owner-facing "write a problem" composer anywhere on this screen
// — the bug box is read-only for the owner, exactly like the "did" half: an agent reports its own limitation
// ("Could not match 1 RedX parcel", "Budget raises always need the owner"), the owner reads it. This file matches
// that scope precisely; it does not build the owner's separate "ask a question, get an investigation" flow the
// schema's own header comment also mentions (`AiBugReport.investigation`/`proposedFix`/`approvalRequestId`
// deliberately stay unused here, the same honest "not this PR" gap PR 312's own `actualPerRunMicros` started with
// before PR 313 wired it) — that needs a real investigating agent, which does not exist yet.
//
// As honest as PR 315/319 about the one thing that has not changed: no job dispatcher or agent runner exists yet,
// so nothing in the real codebase calls `reportCouldNotDo` in production today. The write path and the read
// screen are both fully real and fully tested, ready for the first agent that hits a real limit.
import { type Prisma, type PrismaClient } from '@extas/db/client';
import { isAiAgentKey, type AiAgentKey } from './agents';
import { DIARY_DEFAULT_DAYS, DIARY_MAX_ROWS, type DiaryFilter } from './diary';
import { ensureAgentRows } from './control-room';
import { AiError } from './errors';

type Db = Pick<PrismaClient, 'aiBugReport' | 'aiAgent'>;

export interface BugBoxDeps {
  db: Db;
  now?: () => Date;
}

export interface ReportCouldNotDoInput {
  /** Null for installation-wide work; most reports follow one store. */
  storeId?: number | null;
  agentKey: AiAgentKey;
  /** A few words naming the thing it could not do, e.g. "Could not match 1 RedX parcel". */
  title: string;
  /** Why, in plain Bengali or English — the owner's own explanation of the limit, not a stack trace. */
  why: string;
}

/** Every status `AiBugReport.status` may hold today. Only `'open'` is ever written here — the rest wait for the
 * owner's own investigate/explain/propose/approve flow (not this PR's scope, see the header comment), so a repeat
 * of the same literal here is this file's honest "not yet decided" state, never a guess at a later one. */
export const BUG_REPORT_STATUSES = ['open', 'investigating', 'explained', 'proposed', 'resolved', 'dismissed'] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

/** Writes one "could not do" report for one agent. Throws only for a caller bug (an unknown agent key, or an
 * empty title/why) — never invents either when the caller gave none. */
export async function reportCouldNotDo(deps: BugBoxDeps, input: ReportCouldNotDoInput): Promise<{ id: string }> {
  if (!isAiAgentKey(input.agentKey)) throw new AiError(422, 'UNKNOWN_AGENT', ['agentKey']);
  const title = input.title.trim();
  const why = input.why.trim();
  if (!title) throw new AiError(422, 'INVALID_INPUT', ['title']);
  if (!why) throw new AiError(422, 'INVALID_INPUT', ['why']);
  await ensureAgentRows(deps.db);
  const agent = await deps.db.aiAgent.findUnique({ where: { key: input.agentKey } });
  if (!agent) throw new AiError(422, 'UNKNOWN_AGENT', ['agentKey']);
  const row = await deps.db.aiBugReport.create({
    data: {
      storeId: input.storeId ?? null,
      reportedBy: input.agentKey,
      agentKey: input.agentKey,
      title,
      description: why,
      status: 'open',
    },
  });
  return { id: row.id };
}

export interface BugReportRow {
  id: string;
  storeId: number | null;
  agentKey: string;
  title: string;
  description: string;
  status: string;
  createdAt: Date;
}

/** The owner's own bug-box screen: every report for this store (plus installation-wide ones), newest first,
 * within the window — the same `DIARY_DEFAULT_DAYS`/`DIARY_MAX_ROWS` and agent/day filter shape `diaryView` uses,
 * so the two segments of one screen (PR 319's "what they did", this PR's "could not do") behave identically.
 * Throws only for a caller bug (an unrecognised `agentKey` filter), never for an empty result. */
export async function bugBoxView(deps: BugBoxDeps, storeId: number, filter: DiaryFilter = {}): Promise<BugReportRow[]> {
  if (filter.agentKey != null && !isAiAgentKey(filter.agentKey)) throw new AiError(422, 'UNKNOWN_AGENT', ['agent']);
  const now = deps.now?.() ?? new Date();
  const days = filter.days && filter.days > 0 ? filter.days : DIARY_DEFAULT_DAYS;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const where: Prisma.AiBugReportWhereInput = {
    OR: [{ storeId }, { storeId: null }],
    createdAt: { gte: since },
    ...(filter.agentKey ? { agentKey: filter.agentKey } : {}),
  };
  const rows = await deps.db.aiBugReport.findMany({ where, orderBy: { createdAt: 'desc' }, take: DIARY_MAX_ROWS });
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    agentKey: r.agentKey ?? r.reportedBy,
    title: r.title,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt,
  }));
}
