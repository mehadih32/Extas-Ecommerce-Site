// PR 72 follow-up 100 — Reports › Searches › More options: the "What shoppers search for" card (`search.insights`);
// follow-up 101 adds "Popular words from real searches" (`search.popular`) on the same routes.
//
//   GET /api/admin/search-insights   {cards} the cards with their versions (`reports.read`)
//   PUT /api/admin/search-insights   {key, value, version} one card saved whole (`settings.write`; audited
//                                    `<key>.save`, and in the settings change log with who)
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { searchInsightsSchema, searchPopularSchema, storeTarget, type SearchInsightsSettings, type SearchPopularSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

const S = MOTHER_STORE_ID;

interface Who {
  actor: Actor;
  ctx: RequestContext;
}
type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

export const INSIGHT_KEYS = ['search.insights', 'search.popular'] as const;
export type InsightKey = (typeof INSIGHT_KEYS)[number];

export interface InsightsCard {
  key: InsightKey;
  value: SearchInsightsSettings | SearchPopularSettings;
  version: string;
}
export type InsightsCards = { 'search.insights': InsightsCard & { value: SearchInsightsSettings }; 'search.popular': InsightsCard & { value: SearchPopularSettings } };

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isKey = (k: unknown): k is InsightKey => typeof k === 'string' && (INSIGHT_KEYS as readonly string[]).includes(k);

class InsightsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

export async function insightsCards(deps: Deps): Promise<InsightsCards> {
  const [a, b] = await Promise.all([deps.resolver.value('search.insights', { storeId: S }), deps.resolver.value('search.popular', { storeId: S })]);
  return { 'search.insights': { key: 'search.insights', value: a, version: versionOf(a) }, 'search.popular': { key: 'search.popular', value: b, version: versionOf(b) } };
}

/** Saves one card whole (`settings.write`): checked against its schema and the version the page showed; audited. */
export async function saveInsights(deps: Deps, who: Who, input: unknown): Promise<InsightsCards> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input)) throw new InsightsError('INVALID_INPUT', 400, ['value']);
  if (!isKey(input.key)) throw new InsightsError('INVALID_INPUT', 400, ['key']);
  const key = input.key;
  const before = await deps.resolver.value(key, { storeId: S });
  if (input.version !== versionOf(before)) throw new InsightsError('STALE', 409);
  const ok = (key === 'search.popular' ? searchPopularSchema : searchInsightsSchema).safeParse(input.value);
  if (!ok.success) throw new InsightsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    const meta = { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Searches' };
    if (key === 'search.popular') await deps.resolver.set('search.popular', searchPopularSchema.parse(ok.data), storeTarget(S), meta);
    else await deps.resolver.set('search.insights', searchInsightsSchema.parse(ok.data), storeTarget(S), meta);
    await audit(deps.db, who.actor, { storeId: S, action: `${key}.save`, entityType: 'Setting', entityId: key, before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return insightsCards(deps);
}

/** /api/admin/search-insights — GET the cards (`reports.read`), PUT one (`settings.write`). */
export async function insightsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'reports.read' : 'settings.write', storeId: S });
  if (g instanceof Response) return g;
  try {
    const cards = method === 'GET' ? await insightsCards(deps!) : await saveInsights(deps!, { actor: g.actor, ctx: g.ctx }, await body(request));
    return json({ ok: true, cards });
  } catch (e) {
    if (e instanceof InsightsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
