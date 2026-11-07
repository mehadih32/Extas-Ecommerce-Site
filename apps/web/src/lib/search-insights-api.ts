// PR 72 follow-up 100 — Reports › Searches › More options: the "What shoppers search for" card (`search.insights`).
//
//   GET /api/admin/search-insights   {cards} the card with its version (`reports.read`)
//   PUT /api/admin/search-insights   {key, value, version} the card saved whole (`settings.write`; audited
//                                    `search.insights.save`, and in the settings change log with who)
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { searchInsightsSchema, storeTarget, type SearchInsightsSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

const S = MOTHER_STORE_ID;

interface Who {
  actor: Actor;
  ctx: RequestContext;
}
type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

export interface InsightsCard {
  key: 'search.insights';
  value: SearchInsightsSettings;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

class InsightsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

export async function insightsCard(deps: Deps): Promise<InsightsCard> {
  const value = await deps.resolver.value('search.insights', { storeId: S });
  return { key: 'search.insights', value, version: versionOf(value) };
}

/** Saves the card whole (`settings.write`): checked against its schema and the version the page showed; audited. */
export async function saveInsights(deps: Deps, who: Who, input: unknown): Promise<InsightsCard> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input)) throw new InsightsError('INVALID_INPUT', 400, ['value']);
  const before = await deps.resolver.value('search.insights', { storeId: S });
  if (input.version !== versionOf(before)) throw new InsightsError('STALE', 409);
  const ok = searchInsightsSchema.safeParse(input.value);
  if (!ok.success) throw new InsightsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('search.insights', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Searches' });
    await audit(deps.db, who.actor, { storeId: S, action: 'search.insights.save', entityType: 'Setting', entityId: 'search.insights', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return insightsCard(deps);
}

/** /api/admin/search-insights — GET the card (`reports.read`), PUT it (`settings.write`). */
export async function insightsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'reports.read' : 'settings.write', storeId: S });
  if (g instanceof Response) return g;
  try {
    const card = method === 'GET' ? await insightsCard(deps!) : await saveInsights(deps!, { actor: g.actor, ctx: g.ctx }, await body(request));
    return json({ ok: true, cards: { [card.key]: card } });
  } catch (e) {
    if (e instanceof InsightsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
