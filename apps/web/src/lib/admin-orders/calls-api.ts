// S06 · PR 545 — the call queue's two settings cards, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/calls  the new-customer card (`risk.newCustomer`: the switch, prepaid too) and the outcomes card
//                               (`orders.callOutcomes`: each outcome's words, which of them close the call) (orders.read)
//   PUT  /api/admin/risk/calls  {key: 'newCustomer' | 'outcomes', value, version}  saves one card (risk.rules.write,
//                               audited); a screen read before someone else's save is STALE
// A call is recorded at POST /api/admin/orders/calls/<task> (orders-api.ts, `orders.confirm`). Nothing here confirms,
// holds or cancels an order, or blocks anyone: the queue only asks a person to phone.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { callOutcomesSchema, riskNewCustomerSchema, storeTarget, type CallOutcomes, type RiskNewCustomer } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { handle } from '../orders-api';
import { storeIdOf } from '../shipping-api';

/** The outcomes as the card edits them: each outcome's words by its code, and which codes close the call (ticks). */
export type OutcomesValue = Record<string, { en: string; bn: string } | Record<string, boolean>> & { done: Record<string, boolean> };

export interface CallsCards {
  newCustomer: { key: 'newCustomer'; value: RiskNewCustomer; version: string };
  outcomes: { key: 'outcomes'; value: OutcomesValue; version: string };
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The owner's list as the card shows it. */
export function outcomesValue(list: CallOutcomes): OutcomesValue {
  const out = { done: Object.fromEntries(list.map((o) => [o.key, o.done])) } as OutcomesValue;
  for (const o of list) out[o.key] = { en: o.en, bn: o.bn };
  return out;
}

/** The card's answer back into the list: the same outcomes in the same order, with the words and "closes" changed. */
export function outcomesFrom(list: CallOutcomes, v: Record<string, unknown>): unknown {
  const done = isObj(v.done) ? v.done : null;
  if (!done) return null;
  return list.map((o) => {
    const w = v[o.key];
    return { key: o.key, en: isObj(w) ? w.en : undefined, bn: isObj(w) ? w.bn : undefined, done: done[o.key] === true };
  });
}

export async function callsCards(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<CallsCards> {
  const [nc, outcomes] = await Promise.all([deps.resolver.value('risk.newCustomer', { storeId }), deps.resolver.value('orders.callOutcomes', { storeId })]);
  const ov = outcomesValue(outcomes);
  return { newCustomer: { key: 'newCustomer', value: nc, version: versionOf(nc) }, outcomes: { key: 'outcomes', value: ov, version: versionOf(ov) } };
}

/** /api/admin/risk/calls (GET, PUT). */
export async function callsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method === 'GET') return handle(request, deps, 'orders.read', async (x) => ({ cards: await callsCards(deps!, x.who.storeId) }));
  if (method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'orders.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'newCustomer' && input.key !== 'outcomes') return fail(400, 'INVALID_INPUT', ['key']);
  const cards = await callsCards(d, storeId);
  const before = cards[input.key];
  if (input.version !== before.version) return fail(409, 'STALE');
  const raw = isObj(input.value) ? input.value : null;
  if (input.key === 'newCustomer') {
    const ok = riskNewCustomerSchema.safeParse(raw);
    if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
    if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
      await d.resolver.set('risk.newCustomer', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Orders › Calls to make' });
      await audit(d.db, g.actor, { storeId, action: 'risk.newCustomer.save', entityType: 'Setting', entityId: 'risk.newCustomer', before: { ...cards.newCustomer.value }, after: { ...ok.data } }, g.ctx);
    }
  } else {
    const list = await d.resolver.value('orders.callOutcomes', { storeId });
    const ok = callOutcomesSchema.safeParse(raw ? outcomesFrom(list, raw) : null);
    if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => (typeof i.path[0] === 'number' ? (list[i.path[0]]?.key ?? 'value') : String(i.path[0] ?? 'value'))))]);
    if (JSON.stringify(ok.data) !== JSON.stringify(list)) {
      await d.resolver.set('orders.callOutcomes', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Orders › Calls to make' });
      await audit(d.db, g.actor, { storeId, action: 'orders.callOutcomes.save', entityType: 'Setting', entityId: 'orders.callOutcomes', before: { list }, after: { list: ok.data } }, g.ctx);
    }
  }
  return json({ ok: true, cards: await callsCards(d, storeId) });
}
