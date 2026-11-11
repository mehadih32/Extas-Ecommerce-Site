// S15 · PR 304 (C1.1, C1.2; AIC-01 Control room, demo 97y-adm2-ai.js) — the AI 360 home screen: every fixed agent,
// whether it is on, what it did last, and today's and this month's cost (AiUsageLedger). Nothing here invents a
// number: with no AI provider wired yet (PR 306) and no job run, the cost is honestly 0 and "last activity" is
// honestly empty. A pause button per agent (C1.2) is `ai.control`; it never deletes an agent and never changes what
// it may decide (the permission matrix is PR 318). The business-wide master switch (`ai.enabled`, PR 508) is read
// here only — turning it on or off, and "keep running with the master off", are PR 305.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { Prisma, PrismaClient } from '@extas/db/client';
import { dayStart, ymdIn } from '@extas/metrics';
import type { AppResolver } from '../settings';
import { AI_AGENTS, isAiAgentKey, type AiAgentKey } from './agents';

export class AiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];
  constructor(status: number, code: string, details: string[] = []) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError;
}

export interface ControlRoomDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  now?: () => Date;
}

export interface ControlRoomAgent {
  key: AiAgentKey;
  nameEn: string;
  nameBn: string;
  role: string;
  emoji: string;
  isChief: boolean;
  enabled: boolean;
  /** Only true once the master switch (PR 305) and this agent's own switch are both on. */
  workingNow: boolean;
  lastActivity: { summaryBn: string; at: string } | null;
  todayMinor: number;
  monthMinor: number;
}

export interface ControlRoomView {
  at: string;
  masterOn: boolean;
  monthlyCapMinor: number | null;
  currency: string;
  todayMinor: number;
  monthMinor: number;
  runningNow: number;
  agentCount: number;
}

export interface ControlRoomScreen {
  view: ControlRoomView;
  agents: ControlRoomAgent[];
}

/**
 * Keeps the seven fixed agents' identity rows in step with the catalogue above (the same idea as `syncAuth` for
 * permissions) — never touches a row's `enabled`, `monthlyCapMinor` or `schedule`, which are the owner's own choice.
 */
export async function ensureAgentRows(db: Pick<PrismaClient, 'aiAgent'>): Promise<void> {
  for (const a of AI_AGENTS) {
    await db.aiAgent.upsert({
      where: { key: a.key },
      create: { key: a.key, code: a.code, nameEn: a.nameEn, nameBn: a.nameBn, role: a.role, emoji: a.emoji, isChief: a.isChief, enabled: false, keepOnWhenMasterOff: false, verified: true },
      update: { code: a.code, nameEn: a.nameEn, nameBn: a.nameBn, role: a.role, emoji: a.emoji, isChief: a.isChief },
    });
  }
}

/** Today's and this month's start in the store's own time zone (the same shape as Money → Cost ledger). */
function periodStarts(now: Date, timeZone: string): { today: Date; month: Date } {
  const day = ymdIn(now, timeZone);
  return { today: dayStart(day, timeZone), month: dayStart(`${day.slice(0, 7)}-01`, timeZone) };
}

export async function controlRoomView(deps: ControlRoomDeps, storeId: number): Promise<ControlRoomScreen> {
  const now = deps.now?.() ?? new Date();
  await ensureAgentRows(deps.db);
  const [masterOn, capMinor, currency, timeZone, rows] = await Promise.all([
    deps.resolver.value('ai.enabled', { storeId }),
    deps.resolver.value('ai.monthlyCapMinor', { storeId }),
    deps.resolver.value('store.currency', { storeId }),
    deps.resolver.value('store.timeZone', { storeId }),
    deps.db.aiAgent.findMany({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' } }),
  ]);
  const { today, month } = periodStarts(now, timeZone);
  const ids = rows.map((r) => r.id);
  const [todayByAgent, monthByAgent, diaries] = await Promise.all([
    ids.length ? deps.db.aiUsageLedger.groupBy({ by: ['agentId'], where: { agentId: { in: ids }, createdAt: { gte: today, lte: now } }, _sum: { costMinor: true } }) : [],
    ids.length ? deps.db.aiUsageLedger.groupBy({ by: ['agentId'], where: { agentId: { in: ids }, createdAt: { gte: month, lte: now } }, _sum: { costMinor: true } }) : [],
    ids.length ? deps.db.aiDiaryEntry.findMany({ where: { agentId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 200, select: { agentId: true, summaryBn: true, createdAt: true } }) : [],
  ]);
  const todayMap = new Map(todayByAgent.map((r) => [r.agentId, r._sum.costMinor ?? 0]));
  const monthMap = new Map(monthByAgent.map((r) => [r.agentId, r._sum.costMinor ?? 0]));
  const lastActivity = new Map<string, { summaryBn: string; at: string }>();
  for (const d of diaries) if (!lastActivity.has(d.agentId)) lastActivity.set(d.agentId, { summaryBn: d.summaryBn, at: d.createdAt.toISOString() });

  const agents: ControlRoomAgent[] = rows.filter((r): r is typeof r & { key: AiAgentKey } => isAiAgentKey(r.key)).map((r) => ({
    key: r.key,
    nameEn: r.nameEn,
    nameBn: r.nameBn ?? r.nameEn,
    role: r.role,
    emoji: r.emoji ?? '',
    isChief: r.isChief,
    enabled: r.enabled,
    workingNow: masterOn && r.enabled,
    lastActivity: lastActivity.get(r.id) ?? null,
    todayMinor: todayMap.get(r.id) ?? 0,
    monthMinor: monthMap.get(r.id) ?? 0,
  }));
  const todayMinor = agents.reduce((s, a) => s + a.todayMinor, 0);
  const monthMinor = agents.reduce((s, a) => s + a.monthMinor, 0);
  const runningNow = agents.filter((a) => a.workingNow).length;

  return {
    view: { at: now.toISOString(), masterOn, monthlyCapMinor: capMinor, currency, todayMinor, monthMinor, runningNow, agentCount: agents.length },
    agents,
  };
}

/** Pauses or resumes one agent (C1.2); a no-op when it already is what was asked, so a double tap writes once. */
export async function setAgentEnabled(deps: Pick<ControlRoomDeps, 'db'>, who: { actor: Actor; ctx?: RequestContext }, key: string, enabled: boolean): Promise<void> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  await deps.db.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.aiAgent.findUnique({ where: { key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    if (row.enabled === enabled) return;
    await tx.aiAgent.update({ where: { key }, data: { enabled } });
    await audit(tx, who.actor, { action: enabled ? 'ai.agent.resume' : 'ai.agent.pause', entityType: 'AiAgent', entityId: row.id, before: { enabled: row.enabled }, after: { enabled } }, who.ctx ?? {});
  });
}
