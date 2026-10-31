// S06 · PR 522 — one parcel for one person's orders, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/bundling  the setting as the Risk rules card shows it ({cards: {bundling}}) (risk.rules.read)
//   PUT  /api/admin/risk/bundling  {key: 'bundling', value, version} the switch, the hours, propose or group, the most
//                                   orders (risk.rules.write, audited); a screen read before someone else's save is STALE
//   POST /api/admin/risk/bundle    {orderId, note?} "One parcel" on an order: it and the same person's other open orders
//                                   to the same address go in one group (orders.merge; @extas/orders bundleOrder)
// Grouping never changes lines, prices, charges, payments or the status, and never cancels or blocks anyone.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import * as od from '@extas/orders';
import { riskBundlingSchema, storeTarget, type RiskBundling } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { handle } from '../orders-api';
import { storeIdOf } from '../shipping-api';

export interface BundlingCard {
  key: 'bundling';
  value: RiskBundling;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function bundlingCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<BundlingCard> {
  const value = await deps.resolver.value('risk.bundling', { storeId });
  return { key: 'bundling', value, version: versionOf(value) };
}

/** /api/admin/risk/bundling (GET, PUT). */
export async function bundlingSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: { bundling: await bundlingCard(d, storeId) } });
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'bundling') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await bundlingCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  // an emptied hours box is "not set"
  const raw = isObj(input.value) ? { ...input.value, ...(input.value.windowHours === '' ? { windowHours: null } : {}) } : null;
  const ok = riskBundlingSchema.safeParse(raw);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('risk.bundling', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › One parcel' });
    await audit(d.db, g.actor, { storeId, action: 'risk.bundling.save', entityType: 'Setting', entityId: 'risk.bundling', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { bundling: await bundlingCard(d, storeId) } });
}

/** /api/admin/risk/bundle (POST): "One parcel" on an order. */
export async function bundleRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  return handle(request, deps, 'orders.merge', async (x) => ({ ...(await od.bundleOrder(x.deps, x.who, await body(request))) }));
}
