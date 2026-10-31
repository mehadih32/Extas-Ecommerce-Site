// S06 · PR 524 — the good-customer override's settings card, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/good-customer  the setting as the Risk rules card shows it ({cards: {goodCustomer}}) (risk.rules.read)
//   PUT  /api/admin/risk/good-customer  {key: 'goodCustomer', value, version} the switch, the delivered orders that make a
//                                        good customer, the refusals allowed (risk.rules.write, audited); a screen read
//                                        before someone else's save is STALE
// The override only skips the engine's own holds; nothing here holds, releases, cancels or confirms an order.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { riskGoodCustomerSchema, storeTarget, type RiskGoodCustomer } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export interface GoodCustomerCard {
  key: 'goodCustomer';
  value: RiskGoodCustomer;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function goodCustomerCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<GoodCustomerCard> {
  const value = await deps.resolver.value('risk.goodCustomer', { storeId });
  return { key: 'goodCustomer', value, version: versionOf(value) };
}

/** /api/admin/risk/good-customer (GET, PUT). */
export async function goodCustomerSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: { goodCustomer: await goodCustomerCard(d, storeId) } });
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'goodCustomer') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await goodCustomerCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  // an emptied number box is "not set"
  const raw = isObj(input.value) ? { ...input.value, ...(input.value.minDelivered === '' ? { minDelivered: null } : {}) } : null;
  const ok = riskGoodCustomerSchema.safeParse(raw);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('risk.goodCustomer', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › Good customers' });
    await audit(d.db, g.actor, { storeId, action: 'risk.goodCustomer.save', entityType: 'Setting', entityId: 'risk.goodCustomer', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { goodCustomer: await goodCustomerCard(d, storeId) } });
}
