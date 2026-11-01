// S21 · PR 594 (HLP-02) — "Report a problem on this PR": the owner (or anyone he gives `build.report`) points at the
// exact PR of the build when something on it is wrong, from the PR's card or Help & Build › Reported problems. Each report
// is one BuildProblem row (R-1, R-2 … per store) with the PR number, what is wrong and the admin address it was seen
// on; the build team gives it a status (open → being fixed → fixed with how, or closed with why) and the person sees it
// on the list and on the PR's card. Nothing is deleted: closing keeps the row and its note. Every report and every status
// change is audited. Only a PR the register has can be reported (`known`). Permissions are checked by the caller
// (build-api.ts, the pages); this module checks the input.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { Prisma, PrismaClient } from '@extas/db';
import { z } from 'zod';

export const PROBLEM_STATUSES = ['OPEN', 'FIXING', 'FIXED', 'CLOSED'] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];
export const PROBLEM_VIEWS = ['open', 'done', 'all'] as const;
export type ProblemView = (typeof PROBLEM_VIEWS)[number];
const VIEW_STATUSES: Record<ProblemView, ProblemStatus[]> = { open: ['OPEN', 'FIXING'], done: ['FIXED', 'CLOSED'], all: [...PROBLEM_STATUSES] };
// hardcode-ok: technical bounds — rows on one list, the longest note and address kept, how many times a number is retried
export const PROBLEM_PAGE = 100;
const NOTE_MAX = 2000; // hardcode-ok: see above
const PAGE_MAX = 300; // hardcode-ok: see above
const NUMBER_TRIES = 3; // hardcode-ok: see above

export class BuildProblemError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'UNKNOWN_PR' | 'NOT_FOUND' | 'NOTE_NEEDED' | 'SAME_STATUS',
    readonly details: string[] = [],
  ) {
    super(code);
  }
  get status(): number {
    return this.code === 'NOT_FOUND' ? 404 : this.code === 'SAME_STATUS' ? 409 : 422;
  }
}
export const isBuildProblemError = (e: unknown): e is BuildProblemError => e instanceof BuildProblemError;

export const reportInput = z
  .object({
    pr: z.coerce.number().int().min(1).max(99_999), // hardcode-ok: a PR number's upper bound
    note: z.string().trim().min(3).max(NOTE_MAX),
    page: z
      .string()
      .trim()
      .max(PAGE_MAX)
      .regex(/^\/admin(?:[/?#]|$)/)
      .optional(),
  })
  .strict();

export const statusInput = z
  .object({
    id: z.string().uuid(),
    status: z.enum(PROBLEM_STATUSES),
    note: z.string().trim().max(NOTE_MAX).optional(),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new BuildProblemError('INVALID_INPUT', [...new Set(r.error.issues.map((i) => i.path.join('.') || 'body'))]);
  return r.data;
}

type Db = PrismaClient;
export interface ProblemWho {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export interface ProblemRow {
  id: string;
  number: number;
  prNumber: number;
  note: string;
  page: string | null;
  status: ProblemStatus;
  statusNote: string | null;
  statusAt: Date | null;
  statusBy: string | null;
  reportedBy: string | null;
  createdAt: Date;
}

const SELECT = { id: true, number: true, prNumber: true, note: true, page: true, status: true, statusNote: true, statusAt: true, statusById: true, reportedById: true, createdAt: true } as const satisfies Prisma.BuildProblemSelect;

/** The reports of one view (open: open or being fixed; done: fixed or closed), or of one PR, newest first. */
export async function listProblems(db: Db, storeId: number, opts: { view?: string; pr?: number } = {}): Promise<{ view: ProblemView; rows: ProblemRow[]; counts: Record<ProblemView, number> }> {
  const view: ProblemView = (PROBLEM_VIEWS as readonly string[]).includes(opts.view ?? '') ? (opts.view as ProblemView) : 'open';
  const where: Prisma.BuildProblemWhereInput = { storeId, status: { in: VIEW_STATUSES[view] }, ...(opts.pr ? { prNumber: opts.pr } : {}) };
  const [list, grouped] = await Promise.all([
    db.buildProblem.findMany({ where, orderBy: [{ createdAt: 'desc' }, { number: 'desc' }], take: PROBLEM_PAGE, select: SELECT }),
    db.buildProblem.groupBy({ by: ['status'], where: { storeId, ...(opts.pr ? { prNumber: opts.pr } : {}) }, _count: { _all: true } }),
  ]);
  const ids = [...new Set(list.flatMap((r) => [r.statusById, r.reportedById]).filter((x): x is string => !!x))];
  const staff = ids.length ? await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  const name = new Map(staff.map((s) => [s.id, s.displayName]));
  const n = (s: ProblemStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const counts = { open: n('OPEN') + n('FIXING'), done: n('FIXED') + n('CLOSED'), all: 0 };
  counts.all = counts.open + counts.done;
  return {
    view,
    counts,
    rows: list.map((r) => ({ id: r.id, number: r.number, prNumber: r.prNumber, note: r.note, page: r.page, status: r.status, statusNote: r.statusNote, statusAt: r.statusAt, statusBy: r.statusById ? (name.get(r.statusById) ?? null) : null, reportedBy: r.reportedById ? (name.get(r.reportedById) ?? null) : null, createdAt: r.createdAt })),
  };
}

/** Records a report on a PR the register has; its number is the next one of the store. */
export async function reportProblem(db: Db, who: ProblemWho, input: unknown, known: (pr: number) => boolean): Promise<ProblemRow> {
  const d = parse(reportInput, input);
  if (!known(d.pr)) throw new BuildProblemError('UNKNOWN_PR', ['pr']);
  for (let attempt = 1; ; attempt++) {
    try {
      const row = await db.$transaction(async (tx) => {
        const last = await tx.buildProblem.aggregate({ where: { storeId: who.storeId }, _max: { number: true } });
        const created = await tx.buildProblem.create({
          data: { storeId: who.storeId, number: (last._max.number ?? 0) + 1, prNumber: d.pr, note: d.note, page: d.page ?? null, reportedById: who.actor.staffUserId },
          select: SELECT,
        });
        await audit(tx, who.actor, { action: 'build.problem.report', entityType: 'BuildProblem', entityId: created.id, after: { number: created.number, prNumber: d.pr, page: d.page ?? null }, storeId: who.storeId }, who.ctx);
        return created;
      });
      return { ...row, statusBy: null, reportedBy: null };
    } catch (e) {
      // two reports at the same moment took the same number: the next try takes the one after
      if ((e as { code?: string }).code === 'P2002' && attempt < NUMBER_TRIES) continue;
      throw e;
    }
  }
}

/** Sets a report's status; fixed and closed say how or why. */
export async function setProblemStatus(db: Db, who: ProblemWho, input: unknown): Promise<ProblemRow> {
  const d = parse(statusInput, input);
  const note = d.note?.trim() || null;
  if ((d.status === 'FIXED' || d.status === 'CLOSED') && (!note || note.length < 3)) throw new BuildProblemError('NOTE_NEEDED', ['note']);
  return db.$transaction(async (tx) => {
    const before = await tx.buildProblem.findFirst({ where: { id: d.id, storeId: who.storeId }, select: SELECT });
    if (!before) throw new BuildProblemError('NOT_FOUND', ['id']);
    if (before.status === d.status && (note ?? null) === (before.statusNote ?? null)) throw new BuildProblemError('SAME_STATUS', ['status']);
    const row = await tx.buildProblem.update({ where: { id: before.id }, data: { status: d.status, statusNote: note, statusById: who.actor.staffUserId, statusAt: new Date() }, select: SELECT });
    await audit(tx, who.actor, { action: 'build.problem.status', entityType: 'BuildProblem', entityId: row.id, before: { status: before.status, statusNote: before.statusNote }, after: { status: row.status, statusNote: row.statusNote }, storeId: who.storeId }, who.ctx);
    return { ...row, statusBy: null, reportedBy: null };
  });
}
