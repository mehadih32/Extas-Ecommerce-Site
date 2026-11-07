// S05 · PR 541 follow-up 320 — the "Prepaid orders confirm by themselves" card's admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/prepaid-confirm  the setting as the Risk rules card shows it ({cards: {prepaidConfirm}}) (risk.rules.read)
//   PUT  /api/admin/risk/prepaid-confirm  {key: 'prepaidConfirm', value, version} the one switch (risk.rules.write, audited);
//                                          a screen read before someone else's save is STALE
// The switch only lets a paid prepaid order that nothing flagged confirm by itself (@extas/orders `selfConfirmPrepaid`);
// nothing here moves money or confirms an order.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { prepaidSelfConfirmSchema, storeTarget, type PrepaidSelfConfirm } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export interface PrepaidConfirmCard {
  key: 'prepaidConfirm';
  value: PrepaidSelfConfirm;
  version: string;
}

const KEY = 'orders.prepaid.selfConfirm';
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export async function prepaidConfirmCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<PrepaidConfirmCard> {
  const value = await deps.resolver.value(KEY, { storeId });
  return { key: 'prepaidConfirm', value, version: versionOf(value) };
}

/** /api/admin/risk/prepaid-confirm (GET, PUT). */
export async function prepaidConfirmSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: { prepaidConfirm: await prepaidConfirmCard(d, storeId) } });
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'prepaidConfirm') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await prepaidConfirmCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = prepaidSelfConfirmSchema.safeParse(input.value);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › Prepaid orders' });
    await audit(d.db, g.actor, { storeId, action: 'orders.prepaid.selfConfirm.save', entityType: 'Setting', entityId: KEY, before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { prepaidConfirm: await prepaidConfirmCard(d, storeId) } });
}
