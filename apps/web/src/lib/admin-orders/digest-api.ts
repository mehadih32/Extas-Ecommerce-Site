// S06 · PR 540 — the approval digest and the permission gate, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/digest?from=&to=  the digest of the orders placed in [from, to) (ISO times; without them the
//                                           last day) and what waits for a person, with the gate's card (orders.read)
//   PUT  /api/admin/risk/digest  {key: 'approval', value, version}  the gate and the list size (risk.rules.write,
//                                 audited); a screen read before someone else's save is STALE
//   POST /api/admin/risk/hold-proposals/<orderId>  {decision: hold | dismiss, note} a person decides a proposed hold
//                                 (orders.hold): "hold" holds with the proposal's reason, "dismiss" lets it go
// Nothing here confirms, cancels an order or moves money; a hold only ever follows a person's press.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import * as od from '@extas/orders';
import { riskApprovalSchema, storeTarget, type RiskApproval } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { handle } from '../orders-api';
import { storeIdOf } from '../shipping-api';

export interface ApprovalCard {
  key: 'approval';
  value: RiskApproval;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const DAY_MS = 86_400_000;

export async function approvalCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<ApprovalCard> {
  const value = await deps.resolver.value('risk.approval', { storeId });
  return { key: 'approval', value, version: versionOf(value) };
}

/** A time from the address, or null. */
function timeOf(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** /api/admin/risk/digest (GET, PUT). */
export async function digestRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method === 'GET')
    return handle(request, deps, 'orders.read', async (x) => {
      const to = timeOf(x.url.searchParams.get('to')) ?? (deps!.now?.() ?? new Date());
      const from = timeOf(x.url.searchParams.get('from')) ?? new Date(to.getTime() - DAY_MS);
      if (from >= to) throw new od.OrdersError('INVALID_INPUT', 'the start must be before the end', ['from']);
      return { digest: await od.approvalDigest(x.deps, x.who, { from, to }), cards: { approval: await approvalCard(deps!, x.who.storeId) } };
    });
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
  if (input.key !== 'approval') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await approvalCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  const ok = riskApprovalSchema.safeParse(isObj(input.value) ? input.value : null);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('risk.approval', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: "Orders › Today's digest" });
    await audit(d.db, g.actor, { storeId, action: 'risk.approval.save', entityType: 'Setting', entityId: 'risk.approval', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { approval: await approvalCard(d, storeId) } });
}

/** /api/admin/risk/hold-proposals/<orderId> (POST). */
export function holdProposalRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 2) return Promise.resolve(fail(404, 'not-found'));
  if (request.method.toUpperCase() !== 'POST') return Promise.resolve(fail(405, 'method-not-allowed'));
  return handle(request, deps, 'orders.hold', async (x) => ({ ...(await od.decideHoldProposal(x.deps, x.who, path[1]!, await body(request))) }));
}
