// S15 · PR 339 (Blueprint D5.2 "a funnel per product") — a saved funnel's own CRUD, on the `Funnel` model the
// schema's own owner already reserved for this PR (`@stage S15 · PR 339` in schema.prisma — no schema edit).
// Full CRUD, nothing ever deleted (CLAUDE.md rule 3): `setFunnelArchived` only ever flips `archivedAt`, the same
// archive/restore shape `competitor-list.ts` (PR 337) already uses. Running a saved funnel against the stored
// events is a separate concern, kept in `funnel-run.ts`, so this file never touches `AnalyticsEvent` itself.
import type { Actor, RequestContext } from '@extas/auth';
import { audit } from '@extas/auth';
import { funnelInputSchema, funnelPatchSchema, type FunnelStepDef } from '@extas/analytics';
import type { PrismaClient } from '@extas/db/client';

export class FunnelError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export function isFunnelError(e: unknown): e is FunnelError {
  return e instanceof FunnelError;
}

export interface FunnelListDeps {
  db: PrismaClient;
}

export interface Who {
  actor: Actor;
  ctx: RequestContext;
}

export interface FunnelView {
  id: string;
  name: string;
  steps: FunnelStepDef[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  name: string;
  steps: unknown;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The schema's own `steps` column is a bare `Json`; a row this module itself wrote always parses, but a value
 *  touched by anything else never gets trusted further than "looks like a step list" — the same honesty
 *  `normalizeAnalyticsEvent` already practises for a browser's own payload. */
function stepsOf(raw: unknown): FunnelStepDef[] {
  const ok = funnelInputSchema.shape.steps.safeParse(raw);
  if (!ok.success) throw new FunnelError(500, 'CORRUPT_FUNNEL', ['steps']);
  return ok.data;
}

function view(r: Row): FunnelView {
  return {
    id: r.id,
    name: r.name,
    steps: stepsOf(r.steps),
    archived: r.archivedAt != null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Every saved funnel of the store, newest first (archived last unless asked for). */
export async function listFunnels(deps: FunnelListDeps, storeId: number, opts: { includeArchived?: boolean } = {}): Promise<FunnelView[]> {
  const rows = await deps.db.funnel.findMany({ where: { storeId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ archivedAt: 'asc' }, { createdAt: 'desc' }] });
  return rows.map(view);
}

export async function getFunnel(deps: FunnelListDeps, storeId: number, id: string): Promise<FunnelView> {
  const row = await deps.db.funnel.findFirst({ where: { id, storeId } });
  if (!row) throw new FunnelError(404, 'NOT_FOUND', ['id']);
  return view(row);
}

export async function createFunnel(deps: FunnelListDeps, who: Who, storeId: number, input: unknown): Promise<FunnelView> {
  const ok = funnelInputSchema.safeParse(input);
  if (!ok.success) throw new FunnelError(422, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  const row = await deps.db.funnel.create({ data: { storeId, name: d.name, steps: d.steps } });
  await audit(deps.db, who.actor, { storeId, action: 'analytics.funnel.create', entityType: 'Funnel', entityId: row.id, after: { name: d.name, steps: d.steps } }, who.ctx);
  return view(row);
}

export async function updateFunnel(deps: FunnelListDeps, who: Who, storeId: number, id: string, patch: unknown): Promise<FunnelView> {
  const ok = funnelPatchSchema.safeParse(patch);
  if (!ok.success) throw new FunnelError(422, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const existing = await deps.db.funnel.findFirst({ where: { id, storeId } });
  if (!existing) throw new FunnelError(404, 'NOT_FOUND', ['id']);
  const d = ok.data;
  const row = await deps.db.funnel.update({
    where: { id },
    data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.steps !== undefined ? { steps: d.steps } : {}) },
  });
  await audit(deps.db, who.actor, { storeId, action: 'analytics.funnel.update', entityType: 'Funnel', entityId: id, after: d }, who.ctx);
  return view(row);
}

export async function setFunnelArchived(deps: FunnelListDeps, who: Who, storeId: number, id: string, archived: boolean): Promise<FunnelView> {
  const existing = await deps.db.funnel.findFirst({ where: { id, storeId } });
  if (!existing) throw new FunnelError(404, 'NOT_FOUND', ['id']);
  const row = await deps.db.funnel.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await audit(deps.db, who.actor, { storeId, action: archived ? 'analytics.funnel.archive' : 'analytics.funnel.restore', entityType: 'Funnel', entityId: id }, who.ctx);
  return view(row);
}
