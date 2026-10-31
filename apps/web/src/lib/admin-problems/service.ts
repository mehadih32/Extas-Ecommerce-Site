// S21 · PR 423 (CN-015) — Reports › Site health › Customer problems: the problems the shop's pages reported (one per
// cause, lib/problems/ingest.ts), for a day or a span in the shop's time zone, Urgent first, with how many visitors
// and reports each had then; one problem's page with its days, devices, browsers and networks and its last reports;
// and its status (CN-015 (3)). Seeing needs `health.read`; a status needs `health.problems.manage` and a note when it
// says how, why or what is asked; a problem that needs the owner's permission, or waits for his check, moves on only
// with `health.problems.approve`. The recorder's numbers (`health.problems`) need `settings.write`. Every change is
// audited. No name, phone, address or payment detail exists here to show; the visitor ids are never shown either.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { healthProblemsSchema, storeTarget, type HealthProblemsSettings } from '@extas/settings';
import type { AppResolver } from '../settings';
import type { JourneyStep, ProblemKind, Severity } from '../problems/kinds';
import { addDays, dayOf, dayStartAt, parseWhen, windowOf, type ProblemsWhen } from './days';

export const PROBLEM_STATUSES = ['NEW', 'FIXING', 'FIXED', 'COULD_NOT_FIX', 'NEEDS_OWNER', 'WAITING_OWNER_CHECK'] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];
/** Still open: someone has to do something. */
export const OPEN_STATUSES: readonly ProblemStatus[] = ['NEW', 'FIXING', 'NEEDS_OWNER', 'WAITING_OWNER_CHECK'];
/** A status that says how, why or what is asked: it needs a note. */
export const NOTE_NEEDED: readonly ProblemStatus[] = ['FIXED', 'COULD_NOT_FIX', 'NEEDS_OWNER', 'WAITING_OWNER_CHECK'];
/** The owner's own steps: a problem in one of these moves on only with `health.problems.approve`. */
export const OWNER_STATUSES: readonly ProblemStatus[] = ['NEEDS_OWNER', 'WAITING_OWNER_CHECK'];
/** The longest note. */
export const NOTE_MAX = 1_000; // hardcode-ok: a text-length guard
/** How many days the trend shows, and how many reports a problem's page lists. */
const TREND_DAYS = 14; // hardcode-ok: the size of the two-week chart, not a business number
const LAST_RECORDS = 20; // hardcode-ok: the size of the "last reports" table
const MINUTE = 60_000;
const S = MOTHER_STORE_ID;

export interface ProblemsDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
}
export interface ProblemsWho {
  actor: Actor;
  ctx: RequestContext;
}

export class ProblemsError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'NOT_FOUND' | 'NOTE_NEEDED' | 'OWNER_ONLY',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isProblemsError = (e: unknown): e is ProblemsError => e instanceof ProblemsError;

export interface ProblemRow {
  id: string;
  kind: ProblemKind;
  step: JourneyStep;
  path: string;
  detail: string;
  severity: Severity;
  status: ProblemStatus;
  statusNote: string | null;
  /** Reports and distinct visitors in the view's window. */
  records: number;
  visitors: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Seen only within `glitchMinutes`, and not since: a short glitch (kept, listed apart). */
  glitch: boolean;
  /** Reported again after it was marked fixed. */
  back: boolean;
  version: string;
}

export interface ProblemsCard {
  key: 'problems';
  value: HealthProblemsSettings;
  version: string;
}

export interface ProblemsView {
  when: ProblemsWhen;
  /** The view's first and last day (YYYY-MM-DD, the shop's time zone). */
  firstDay: string;
  lastDay: string;
  enabled: boolean;
  open: { total: number; urgent: number; important: number };
  visitors: number;
  rows: ProblemRow[];
  glitches: ProblemRow[];
  /** Reports a day for the last two weeks, oldest first. */
  trend: { day: string; records: number }[];
  cards: { problems: ProblemsCard };
}

export interface ProblemDetail {
  row: ProblemRow;
  trend: { day: string; records: number }[];
  by: {
    device: [string, number][];
    browser: [string, number][];
    network: [string, number][];
  };
  last: {
    at: string;
    device: string;
    browser: string;
    network: string | null;
    ms: number | null;
  }[];
  statusAt: string | null;
  showDays: number;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const RANK: Record<Severity, number> = { URGENT: 0, IMPORTANT: 1, CAN_WAIT: 2 };

type Problem = Awaited<ReturnType<PrismaClient['customerProblem']['findMany']>>[number];

function rowOf(p: Problem, records: number, visitors: number, glitchMinutes: number, now: Date): ProblemRow {
  const span = p.lastSeenAt.getTime() - p.firstSeenAt.getTime();
  const quiet = now.getTime() - p.lastSeenAt.getTime();
  return {
    id: p.id,
    kind: p.kind as ProblemKind,
    step: p.step as JourneyStep,
    path: p.path,
    detail: p.detail,
    severity: p.severity as Severity,
    status: p.status as ProblemStatus,
    statusNote: p.statusNote,
    records,
    visitors,
    firstSeenAt: p.firstSeenAt.toISOString(),
    lastSeenAt: p.lastSeenAt.toISOString(),
    glitch: span <= glitchMinutes * MINUTE && quiet > glitchMinutes * MINUTE,
    back: p.status === 'FIXED' && !!p.statusAt && p.lastSeenAt > p.statusAt,
    version: p.updatedAt.toISOString(),
  };
}

/** Reports a day (the shop's days) from `first` for `days` days. */
async function trendOf(db: PrismaClient, where: { storeId: number; problemId?: string }, first: string, days: number, timeZone: string): Promise<{ day: string; records: number }[]> {
  const from = dayStartAt(first, timeZone);
  const to = dayStartAt(addDays(first, days), timeZone);
  const rows = await db.problemRecord.findMany({
    where: { ...where, createdAt: { gte: from, lt: to } },
    select: { createdAt: true },
  });
  const count = new Map<string, number>();
  for (const r of rows) count.set(dayOf(r.createdAt, timeZone), (count.get(dayOf(r.createdAt, timeZone)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => addDays(first, i)).map((day) => ({ day, records: count.get(day) ?? 0 }));
}

/** The list for a view (`health.read`). */
export async function problemsView(deps: ProblemsDeps, who: ProblemsWho, when: ProblemsWhen): Promise<ProblemsView> {
  await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const now = deps.now?.() ?? new Date();
  const [cfg, timeZone] = await Promise.all([deps.resolver.value('health.problems', { storeId: S }), deps.resolver.value('store.timeZone', { storeId: S })]);
  const win = windowOf(when, now, timeZone, cfg.showDays);
  const hits = await deps.db.problemRecord.groupBy({
    by: ['problemId', 'visitorId'],
    where: { storeId: S, createdAt: { gte: win.from, lt: win.to } },
    _count: { _all: true },
  });
  const per = new Map<string, { records: number; visitors: number }>();
  const everyone = new Set<string>();
  for (const h of hits) {
    const e = per.get(h.problemId) ?? { records: 0, visitors: 0 };
    e.records += h._count._all;
    e.visitors += 1;
    per.set(h.problemId, e);
    everyone.add(h.visitorId);
  }
  const problems = per.size
    ? await deps.db.customerProblem.findMany({
        where: { storeId: S, id: { in: [...per.keys()] } },
      })
    : [];
  const all = problems
    .map((p) => rowOf(p, per.get(p.id)!.records, per.get(p.id)!.visitors, cfg.glitchMinutes, now))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.visitors - a.visitors || b.lastSeenAt.localeCompare(a.lastSeenAt));
  const open = await deps.db.customerProblem.groupBy({
    by: ['severity'],
    where: { storeId: S, status: { in: [...OPEN_STATUSES] } },
    _count: { _all: true },
  });
  const openOf = (s: Severity) => open.find((o) => o.severity === s)?._count._all ?? 0;
  const today = dayOf(now, timeZone);
  return {
    when,
    firstDay: dayOf(win.from, timeZone),
    lastDay: addDays(dayOf(win.from, timeZone), win.days - 1),
    enabled: cfg.enabled,
    open: {
      total: open.reduce((n, o) => n + o._count._all, 0),
      urgent: openOf('URGENT'),
      important: openOf('IMPORTANT'),
    },
    visitors: everyone.size,
    rows: all.filter((r) => !r.glitch),
    glitches: all.filter((r) => r.glitch),
    trend: await trendOf(deps.db, { storeId: S }, addDays(today, 1 - TREND_DAYS), TREND_DAYS, timeZone),
    cards: {
      problems: { key: 'problems', value: cfg, version: versionOf(cfg) },
    },
  };
}

/** One problem's page (`health.read`). */
export async function problemDetail(deps: ProblemsDeps, who: ProblemsWho, id: string): Promise<ProblemDetail> {
  await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ProblemsError('NOT_FOUND', 404);
  const p = await deps.db.customerProblem.findFirst({
    where: { id, storeId: S },
  });
  if (!p) throw new ProblemsError('NOT_FOUND', 404);
  const now = deps.now?.() ?? new Date();
  const [cfg, timeZone] = await Promise.all([deps.resolver.value('health.problems', { storeId: S }), deps.resolver.value('store.timeZone', { storeId: S })]);
  const since = dayStartAt(addDays(dayOf(now, timeZone), 1 - cfg.showDays), timeZone);
  const where = { problemId: p.id, createdAt: { gte: since } };
  const [visitors, records, device, browser, network, last] = await Promise.all([
    deps.db.problemRecord.groupBy({ by: ['visitorId'], where }),
    deps.db.problemRecord.count({ where }),
    deps.db.problemRecord.groupBy({
      by: ['device'],
      where,
      _count: { _all: true },
    }),
    deps.db.problemRecord.groupBy({
      by: ['browser'],
      where,
      _count: { _all: true },
    }),
    deps.db.problemRecord.groupBy({
      by: ['network'],
      where,
      _count: { _all: true },
    }),
    deps.db.problemRecord.findMany({
      where: { problemId: p.id },
      orderBy: { createdAt: 'desc' },
      take: LAST_RECORDS,
      select: {
        createdAt: true,
        device: true,
        browser: true,
        network: true,
        ms: true,
      },
    }),
  ]);
  const top = <K extends string>(rows: ({ _count: { _all: number } } & Record<K, string | null>)[], k: K): [string, number][] =>
    rows.map((r) => [r[k] ?? '', r._count._all] as [string, number]).sort((a, b) => b[1] - a[1]);
  return {
    row: rowOf(p, records, visitors.length, cfg.glitchMinutes, now),
    trend: await trendOf(deps.db, { storeId: S, problemId: p.id }, addDays(dayOf(now, timeZone), 1 - TREND_DAYS), TREND_DAYS, timeZone),
    by: {
      device: top(device, 'device'),
      browser: top(browser, 'browser'),
      network: top(network, 'network'),
    },
    last: last.map((r) => ({
      at: r.createdAt.toISOString(),
      device: r.device,
      browser: r.browser,
      network: r.network,
      ms: r.ms,
    })),
    statusAt: p.statusAt?.toISOString() ?? null,
    showDays: cfg.showDays,
  };
}

/** A problem's status with its note (CN-015 (3)); the owner's steps need `health.problems.approve`. */
export async function setProblemStatus(deps: ProblemsDeps, who: ProblemsWho, id: string, input: unknown): Promise<ProblemDetail> {
  await requirePermission(deps.db, who.actor, 'health.problems.manage', {
    storeId: S,
  });
  if (!isObj(input) || typeof input.status !== 'string' || !(PROBLEM_STATUSES as readonly string[]).includes(input.status)) throw new ProblemsError('INVALID_INPUT', 400, ['status']);
  const status = input.status as ProblemStatus;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > NOTE_MAX) throw new ProblemsError('INVALID_INPUT', 400, ['note']);
  if (NOTE_NEEDED.includes(status) && !note) throw new ProblemsError('NOTE_NEEDED', 400, ['note']);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ProblemsError('NOT_FOUND', 404);
  const p = await deps.db.customerProblem.findFirst({
    where: { id, storeId: S },
  });
  if (!p) throw new ProblemsError('NOT_FOUND', 404);
  if (input.version !== p.updatedAt.toISOString()) throw new ProblemsError('STALE', 409);
  const before = p.status as ProblemStatus;
  // The owner's steps: leaving "needs the owner's permission" or "waiting for his check" is his call.
  if (OWNER_STATUSES.includes(before) && before !== status) {
    try {
      await requirePermission(deps.db, who.actor, 'health.problems.approve', {
        storeId: S,
      });
    } catch {
      throw new ProblemsError('OWNER_ONLY', 403);
    }
  }
  const now = deps.now?.() ?? new Date();
  await deps.db.customerProblem.update({
    where: { id: p.id },
    data: {
      status,
      statusNote: note || null,
      statusById: who.actor.staffUserId ?? null,
      statusAt: now,
    },
  });
  await audit(
    deps.db,
    who.actor,
    {
      storeId: S,
      action: 'health.problem.status',
      entityType: 'CustomerProblem',
      entityId: p.id,
      before: { status: before, note: p.statusNote },
      after: { status, note: note || null },
    },
    who.ctx,
  );
  return problemDetail(deps, who, p.id);
}

/** The recorder's numbers (`settings.write`, audited). */
export async function saveProblemsCard(deps: ProblemsDeps, who: ProblemsWho, input: unknown): Promise<ProblemsView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.key !== 'problems') throw new ProblemsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('health.problems', { storeId: S });
  if (input.version !== versionOf(before)) throw new ProblemsError('STALE', 409);
  const ok = healthProblemsSchema.safeParse(input.value);
  if (!ok.success) throw new ProblemsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const changed = (Object.keys(ok.data) as (keyof HealthProblemsSettings)[]).filter((k) => ok.data[k] !== before[k]);
  if (changed.length) {
    await deps.resolver.set('health.problems', ok.data, storeTarget(S), {
      actorId: who.actor.staffUserId ?? null,
      reason: 'Reports › Site health › Customer problems',
    });
    await audit(
      deps.db,
      who.actor,
      {
        storeId: S,
        action: 'health.problems.save',
        entityType: 'Setting',
        entityId: 'health.problems',
        before: { ...before },
        after: { ...ok.data, changed },
      },
      who.ctx,
    );
  }
  return problemsView(deps, who, parseWhen(typeof input.when === 'string' ? input.when : undefined));
}

/** The hub's problems line: open problems by severity, and whether the recorder is on (`health.read` checked by the hub). */
export async function openProblemCounts(deps: Pick<ProblemsDeps, 'db' | 'resolver'>): Promise<{
  enabled: boolean;
  urgent: number;
  important: number;
  canWait: number;
  lastSeenAt: Date | null;
}> {
  const [cfg, open, last] = await Promise.all([
    deps.resolver.value('health.problems', { storeId: S }),
    deps.db.customerProblem.groupBy({
      by: ['severity'],
      where: { storeId: S, status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    }),
    deps.db.customerProblem.findFirst({
      where: { storeId: S, status: { in: [...OPEN_STATUSES] } },
      orderBy: { lastSeenAt: 'desc' },
      select: { lastSeenAt: true },
    }),
  ]);
  const of = (s: Severity) => open.find((o) => o.severity === s)?._count._all ?? 0;
  return {
    enabled: cfg.enabled,
    urgent: of('URGENT'),
    important: of('IMPORTANT'),
    canWait: of('CAN_WAIT'),
    lastSeenAt: last?.lastSeenAt ?? null,
  };
}
