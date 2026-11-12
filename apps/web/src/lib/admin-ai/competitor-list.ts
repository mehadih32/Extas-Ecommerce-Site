// S15 · PR 337 (Blueprint B8 "Competitor Teardown agent", B8.4, B8.10 item 14) — the third slice of B8.4's own
// +3-PR split (journey walker is PR 335; comparison/report engine is PR 336): a saved list of competitors, the
// owner's own "track 3 to 5, not one" (B8.4). Uses the `Competitor`/`CompetitorReport` models the schema's own
// owner already reserved for exactly PR 335–337 (`@stage S15 · PR 335–337` in `schema.prisma`) — no schema edit
// in this PR. Each row is one saved page studied over time (the schema's own `url: String`, one address, not the
// full four-stage journey PR 335/336 can walk ad hoc) — a deliberate simplification the schema's own shape
// already encodes, matching B8.4's "a saved list of competitors" rather than B8.1's richer one-off walk.
//
// CRUD only (list/create/update/archive/restore — CLAUDE.md rule 3, nothing deleted); the real recheck (walking
// the page, diffing it against the last run, alerting on a change) is `competitor-recheck.ts`, kept separate so
// this file never touches a network or an AI provider.
import { z } from 'zod';
import type { Actor, RequestContext } from '@extas/auth';
import { audit } from '@extas/auth';
import { readableUrl } from '@extas/adapters';
import type { PrismaClient } from '@extas/db/client';
import { AiError } from './errors';
import { nextDueAt, type CompetitorSchedule } from './competitor-schedule';

export interface CompetitorListDeps {
  db: PrismaClient;
}

export interface Who {
  actor: Actor;
  ctx: RequestContext;
}

export const competitorScheduleSchema = z.enum(['weekly', 'monthly']).nullable();

const competitorInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    url: z.string().trim().min(1).max(500),
    schedule: competitorScheduleSchema.optional(),
  })
  .strict();
export type CompetitorInput = z.infer<typeof competitorInput>;

const competitorPatch = competitorInput.partial().strict();
export type CompetitorPatch = z.infer<typeof competitorPatch>;

export interface CompetitorView {
  id: string;
  name: string;
  url: string;
  schedule: CompetitorSchedule;
  lastRunAt: string | null;
  /** A preview only — B8.10 item 14 ("weekly or monthly") is the owner's own still-open choice per competitor;
   * no job runner re-checks a competitor automatically yet (the same honest, structural gap PR 308 already
   * documented for `AiAgent.schedule` — the whole AI 360 dispatch layer this reuses lives in the Next.js app,
   * not the separate background-worker process that would need to call it). "Run now" always works regardless. */
  nextDueAt: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  name: string;
  url: string;
  schedule: string | null;
  lastRunAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function asSchedule(raw: string | null): CompetitorSchedule {
  return raw === 'weekly' || raw === 'monthly' ? raw : null;
}

function view(r: Row, now: Date): CompetitorView {
  const schedule = asSchedule(r.schedule);
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    schedule,
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    nextDueAt: nextDueAt(schedule, r.lastRunAt, now)?.toISOString() ?? null,
    archived: r.archivedAt != null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** `readableUrl`'s own refusal (BAD_URL, non-http(s), a URL with embedded credentials), turned into this module's
 * own `AiError` shape — the same http(s)-only check PR 335's own walker relies on, checked here too so a bad
 * address is refused at save time, not only discovered on the first "Run now". */
function checkUrl(raw: string): string {
  try {
    return readableUrl(raw).toString();
  } catch {
    throw new AiError(422, 'INVALID_URL', ['url']);
  }
}

/** Every saved competitor of the store, newest first (archived last unless asked for). */
export async function listCompetitors(deps: CompetitorListDeps, storeId: number, opts: { includeArchived?: boolean } = {}, now = new Date()): Promise<CompetitorView[]> {
  const rows = await deps.db.competitor.findMany({ where: { storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }] });
  return rows.map((r) => view(r, now));
}

export async function getCompetitor(deps: CompetitorListDeps, storeId: number, id: string, now = new Date()): Promise<CompetitorView> {
  const row = await deps.db.competitor.findFirst({ where: { id, storeId } });
  if (!row) throw new AiError(404, 'NOT_FOUND', ['id']);
  return view(row, now);
}

export async function createCompetitor(deps: CompetitorListDeps, who: Who, storeId: number, input: unknown): Promise<CompetitorView> {
  const ok = competitorInput.safeParse(input);
  if (!ok.success) throw new AiError(422, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  const url = checkUrl(d.url);
  const row = await deps.db.competitor.create({ data: { storeId, name: d.name, url, schedule: d.schedule ?? null } });
  await audit(deps.db, who.actor, { storeId, action: 'ai.competitor.create', entityType: 'Competitor', entityId: row.id, after: { name: d.name, url } }, who.ctx);
  return view(row, new Date());
}

export async function updateCompetitor(deps: CompetitorListDeps, who: Who, storeId: number, id: string, patch: unknown): Promise<CompetitorView> {
  const ok = competitorPatch.safeParse(patch);
  if (!ok.success) throw new AiError(422, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const existing = await deps.db.competitor.findFirst({ where: { id, storeId } });
  if (!existing) throw new AiError(404, 'NOT_FOUND', ['id']);
  const d = ok.data;
  const row = await deps.db.competitor.update({
    where: { id },
    data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.url !== undefined ? { url: checkUrl(d.url) } : {}), ...(d.schedule !== undefined ? { schedule: d.schedule } : {}) },
  });
  await audit(deps.db, who.actor, { storeId, action: 'ai.competitor.update', entityType: 'Competitor', entityId: id, after: d }, who.ctx);
  return view(row, new Date());
}

export async function setCompetitorArchived(deps: CompetitorListDeps, who: Who, storeId: number, id: string, archived: boolean): Promise<CompetitorView> {
  const existing = await deps.db.competitor.findFirst({ where: { id, storeId } });
  if (!existing) throw new AiError(404, 'NOT_FOUND', ['id']);
  const row = await deps.db.competitor.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await audit(deps.db, who.actor, { storeId, action: archived ? 'ai.competitor.archive' : 'ai.competitor.restore', entityType: 'Competitor', entityId: id }, who.ctx);
  return view(row, new Date());
}
