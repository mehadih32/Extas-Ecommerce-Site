// S06 · PR 543 — /api/admin/risk/learning (Reports › Decisions & learning):
//   GET  the learning report (@extas/orders learningReport: the team's decisions on what the engine stopped or proposed,
//        per rule and per person, how the orders let go ended, and the suggestions; off: says so and reads nothing) with
//        the learning's own settings card (`risk.learning`)
//   PUT  {key: 'learning', value, version}  the switch, the days, the fewest decisions, the share for a suggestion and
//        the most decisions (`settings.write`, audited); a screen read before someone else's save is refused with STALE
// Seeing needs `risk.report`. The learning only suggests: nothing here changes a rule, an order or money.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import * as od from '@extas/orders';
import { riskLearningSchema, storeTarget, type RiskLearning } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { handle } from '../orders-api';
import { storeIdOf } from '../shipping-api';

export interface LearningCard {
  key: 'learning';
  value: RiskLearning;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The learning's settings card as the screen shows it. */
export async function learningCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<LearningCard> {
  const value = await deps.resolver.value('risk.learning', { storeId });
  return { key: 'learning', value, version: versionOf(value) };
}

/** Every /api/admin/risk/learning call (`path` after /risk). */
export async function learningRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method === 'GET') return handle(request, deps, 'risk.report', async (x) => ({ report: await od.learningReport(x.deps, x.who), cards: { learning: await learningCard(deps!, x.who.storeId) } }));
  if (method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.report', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    await requirePermission(d.db, g.actor, 'settings.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'learning') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await learningCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = riskLearningSchema.safeParse(isObj(input.value) ? input.value : null);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('risk.learning', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Reports › Decisions & learning' });
    await audit(d.db, g.actor, { storeId, action: 'risk.learning.save', entityType: 'Setting', entityId: 'risk.learning', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { learning: await learningCard(d, storeId) } });
}
