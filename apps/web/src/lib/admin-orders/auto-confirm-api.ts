// S28 · PR 663 — the auto-confirm rules table's settings card, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/auto-confirm  the setting as the Risk rules card shows it ({cards: {autoConfirm}}) (risk.rules.read)
//   PUT  /api/admin/risk/auto-confirm  {key: 'autoConfirm', value, version} the switch, the preset, the nine answers, the
//                                       trusted customer's counts and the big cash order limit (risk.rules.write, audited);
//                                       a screen read before someone else's save is STALE
// The table only decides what a person's Confirm would do; nothing here moves money or blocks anyone.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { AUTO_CONFIRM_PRESETS, ordersAutoConfirmSchema, storeTarget, type OrdersAutoConfirm } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export interface AutoConfirmCard {
  key: 'autoConfirm';
  value: OrdersAutoConfirm;
  version: string;
}

const KEY = 'orders.autoConfirm';
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

export async function autoConfirmCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<AutoConfirmCard> {
  const value = await deps.resolver.value(KEY, { storeId });
  return { key: 'autoConfirm', value, version: versionOf(value) };
}

/** /api/admin/risk/prepaid-confirm (GET, PUT). */
export async function autoConfirmSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: { autoConfirm: await autoConfirmCard(d, storeId) } });
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'autoConfirm') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await autoConfirmCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = ordersAutoConfirmSchema.safeParse(input.value);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  // the preset always names the table: a table that equals a preset is that preset, any other is 'custom'
  const hit = (['low', 'normal', 'strict'] as const).find((k) => JSON.stringify(AUTO_CONFIRM_PRESETS[k]) === JSON.stringify(ok.data.cases));
  ok.data.preset = hit ?? 'custom';
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set(KEY, ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › Auto-confirm' });
    await audit(d.db, g.actor, { storeId, action: 'orders.autoConfirm.save', entityType: 'Setting', entityId: KEY, before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { autoConfirm: await autoConfirmCard(d, storeId) } });
}
