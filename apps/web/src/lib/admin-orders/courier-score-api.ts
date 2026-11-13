// S28 · PR 662 — the courier score's settings card, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/courier-score  the setting as the Risk rules card shows it ({cards: {courierScore}}) (risk.rules.read)
//   PUT  /api/admin/risk/courier-score  {key: 'courierScore', value, version} the switch, the two limits, the six checks' weights
//                                        and point limits (risk.rules.write, audited); a screen read before someone else's
//                                        save is STALE
// The score only informs; nothing here moves an order or money.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { riskCourierScoreSchema, storeTarget, type RiskCourierScore } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export interface CourierScoreCard {
  key: 'courierScore';
  value: RiskCourierScore;
  version: string;
}

const KEY = 'risk.courierScore';
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export async function courierScoreCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<CourierScoreCard> {
  const value = await deps.resolver.value(KEY, { storeId });
  return { key: 'courierScore', value, version: versionOf(value) };
}

/** /api/admin/risk/prepaid-confirm (GET, PUT). */
export async function courierScoreSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: { courierScore: await courierScoreCard(d, storeId) } });
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'courierScore') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await courierScoreCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = riskCourierScoreSchema.safeParse(input.value);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › Courier score' });
    await audit(d.db, g.actor, { storeId, action: 'risk.courierScore.save', entityType: 'Setting', entityId: KEY, before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { courierScore: await courierScoreCard(d, storeId) } });
}
