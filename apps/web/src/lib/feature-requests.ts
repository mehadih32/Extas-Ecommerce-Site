// S02 · PR 599 (register "In-dashboard help and the handover user manual": "a truly new function is requested through
// the PR register ('request a feature') and built by the agent team, never by editing code by hand") — Help & Build ›
// Feature requests. A request is one FeatureRequest row (F-1, F-2 … per store): a short name, what it should do (in the
// person's own words), the admin section it belongs to and how soon it is needed. It never changes the shop: the build
// team reads it, gives it a register PR number (or says it is already possible with a switch, a Smart Rule or an
// integration, with where) and the person follows it on the list: new → in the register (PR n) → built, or not built
// (why). Nothing is deleted: a request is closed with its note. Every request and every status change is audited.
// Permissions are checked by the caller (the API, the page): seeing `build.read`, asking and setting a status
// `build.report`. This module checks the input.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { Prisma, PrismaClient } from '@extas/db';
import { z } from 'zod';

export const REQUEST_STATUSES = ['NEW', 'REGISTERED', 'BUILT', 'POSSIBLE', 'DECLINED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_VIEWS = ['open', 'done', 'all'] as const;
export type RequestView = (typeof REQUEST_VIEWS)[number];
const VIEW_STATUSES: Record<RequestView, RequestStatus[]> = { open: ['NEW', 'REGISTERED'], done: ['BUILT', 'POSSIBLE', 'DECLINED'], all: [...REQUEST_STATUSES] };
export const REQUEST_WHEN = ['SOON', 'LATER'] as const;
// hardcode-ok: technical bounds — rows on one list, the longest name, text and address kept, a section id, number retries
export const REQUEST_PAGE = 100;
const TITLE_MAX = 120; // hardcode-ok: see above
const NEED_MAX = 4000; // hardcode-ok: see above
const PAGE_MAX = 300; // hardcode-ok: see above
const NUMBER_TRIES = 3; // hardcode-ok: see above

export class FeatureRequestError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'NOTE_NEEDED' | 'PR_NEEDED' | 'SAME_STATUS',
    readonly details: string[] = [],
  ) {
    super(code);
  }
  get status(): number {
    return this.code === 'NOT_FOUND' ? 404 : this.code === 'SAME_STATUS' ? 409 : 422;
  }
}
export const isFeatureRequestError = (e: unknown): e is FeatureRequestError => e instanceof FeatureRequestError;

export const askInput = z
  .object({
    title: z.string().trim().min(3).max(TITLE_MAX),
    need: z.string().trim().min(10).max(NEED_MAX),
    section: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9-]{0,39}$/)
      .optional(),
    page: z
      .string()
      .trim()
      .max(PAGE_MAX)
      .regex(/^\/admin(?:[/?#]|$)/)
      .optional(),
    when: z.enum(REQUEST_WHEN).default('LATER'),
  })
  .strict();

export const requestStatusInput = z
  .object({
    id: z.string().uuid(),
    status: z.enum(REQUEST_STATUSES),
    pr: z.coerce.number().int().min(1).max(99_999).optional(), // hardcode-ok: a PR number's upper bound
    note: z.string().trim().max(NEED_MAX).optional(),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new FeatureRequestError('INVALID_INPUT', [...new Set(r.error.issues.map((i) => i.path.join('.') || 'body'))]);
  return r.data;
}

type Db = PrismaClient;
export interface RequestWho {
  actor: Actor;
  storeId: number;
  ctx?: RequestContext;
}

export interface RequestRow {
  id: string;
  number: number;
  title: string;
  need: string;
  section: string | null;
  page: string | null;
  when: 'SOON' | 'LATER';
  status: RequestStatus;
  prNumber: number | null;
  statusNote: string | null;
  statusAt: Date | null;
  statusBy: string | null;
  askedBy: string | null;
  createdAt: Date;
}

const SELECT = { id: true, number: true, title: true, need: true, section: true, page: true, urgency: true, status: true, prNumber: true, statusNote: true, statusAt: true, statusById: true, requestedById: true, createdAt: true } as const satisfies Prisma.FeatureRequestSelect;
type Raw = Prisma.FeatureRequestGetPayload<{ select: typeof SELECT }>;
const rowOf = (r: Raw, name: ReadonlyMap<string, string>): RequestRow => ({
  id: r.id,
  number: r.number,
  title: r.title,
  need: r.need,
  section: r.section,
  page: r.page,
  when: r.urgency,
  status: r.status,
  prNumber: r.prNumber,
  statusNote: r.statusNote,
  statusAt: r.statusAt,
  statusBy: r.statusById ? (name.get(r.statusById) ?? null) : null,
  askedBy: r.requestedById ? (name.get(r.requestedById) ?? null) : null,
  createdAt: r.createdAt,
});

/** The requests of one view (open: new or in the register; done: built, already possible or not built), newest first. */
export async function listRequests(db: Db, storeId: number, opts: { view?: string } = {}): Promise<{ view: RequestView; rows: RequestRow[]; counts: Record<RequestView, number> }> {
  const view: RequestView = (REQUEST_VIEWS as readonly string[]).includes(opts.view ?? '') ? (opts.view as RequestView) : 'open';
  const [list, grouped] = await Promise.all([
    db.featureRequest.findMany({ where: { storeId, status: { in: VIEW_STATUSES[view] } }, orderBy: [{ createdAt: 'desc' }, { number: 'desc' }], take: REQUEST_PAGE, select: SELECT }),
    db.featureRequest.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true } }),
  ]);
  const ids = [...new Set(list.flatMap((r) => [r.statusById, r.requestedById]).filter((x): x is string => !!x))];
  const staff = ids.length ? await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  const name = new Map(staff.map((s) => [s.id, s.displayName]));
  const n = (s: RequestStatus) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const counts = { open: n('NEW') + n('REGISTERED'), done: n('BUILT') + n('POSSIBLE') + n('DECLINED'), all: 0 };
  counts.all = counts.open + counts.done;
  return { view, counts, rows: list.map((r) => rowOf(r, name)) };
}

/** Records a request; its number is the next one of the store. */
export async function askFeature(db: Db, who: RequestWho, input: unknown): Promise<RequestRow> {
  const d = parse(askInput, input);
  for (let attempt = 1; ; attempt++) {
    try {
      const row = await db.$transaction(async (tx) => {
        const last = await tx.featureRequest.aggregate({ where: { storeId: who.storeId }, _max: { number: true } });
        const created = await tx.featureRequest.create({
          data: { storeId: who.storeId, number: (last._max.number ?? 0) + 1, title: d.title, need: d.need, section: d.section ?? null, page: d.page ?? null, urgency: d.when, requestedById: who.actor.staffUserId },
          select: SELECT,
        });
        await audit(tx, who.actor, { action: 'build.request.ask', entityType: 'FeatureRequest', entityId: created.id, after: { number: created.number, title: d.title, section: d.section ?? null, when: d.when }, storeId: who.storeId }, who.ctx);
        return created;
      });
      return rowOf(row, new Map());
    } catch (e) {
      // two requests at the same moment took the same number: the next try takes the one after
      if ((e as { code?: string }).code === 'P2002' && attempt < NUMBER_TRIES) continue;
      throw e;
    }
  }
}

/** Sets a request's status: in the register and built need the PR number; already possible and not built say where or why. */
export async function setRequestStatus(db: Db, who: RequestWho, input: unknown): Promise<RequestRow> {
  const d = parse(requestStatusInput, input);
  const note = d.note?.trim() || null;
  if ((d.status === 'REGISTERED' || d.status === 'BUILT') && !d.pr) throw new FeatureRequestError('PR_NEEDED', ['pr']);
  if ((d.status === 'POSSIBLE' || d.status === 'DECLINED') && (!note || note.length < 3)) throw new FeatureRequestError('NOTE_NEEDED', ['note']);
  return db.$transaction(async (tx) => {
    const before = await tx.featureRequest.findFirst({ where: { id: d.id, storeId: who.storeId }, select: SELECT });
    if (!before) throw new FeatureRequestError('NOT_FOUND', ['id']);
    const pr = d.pr ?? before.prNumber ?? null;
    if (before.status === d.status && pr === before.prNumber && (note ?? null) === (before.statusNote ?? null)) throw new FeatureRequestError('SAME_STATUS', ['status']);
    const row = await tx.featureRequest.update({ where: { id: before.id }, data: { status: d.status, prNumber: pr, statusNote: note, statusById: who.actor.staffUserId, statusAt: new Date() }, select: SELECT });
    await audit(tx, who.actor, { action: 'build.request.status', entityType: 'FeatureRequest', entityId: row.id, before: { status: before.status, prNumber: before.prNumber, statusNote: before.statusNote }, after: { status: row.status, prNumber: row.prNumber, statusNote: row.statusNote }, storeId: who.storeId }, who.ctx);
    return rowOf(row, new Map());
  });
}

/** The open requests as Markdown, for the build team's register flow (newest first; the person's own words). */
export function requestsMarkdown(rows: readonly RequestRow[], heading: string): string {
  const one = (s: string) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  const lines = [`# ${heading}`, '', '| # | Asked | Section | When | Status | PR | Name | What it should do |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| F-${r.number} | ${new Date(r.createdAt).toISOString().slice(0, 10)} | ${r.section ?? ''} | ${r.when} | ${r.status} | ${r.prNumber ?? ''} | ${one(r.title)} | ${one(r.need)} |`);
  return `${lines.join('\n')}\n`;
}
