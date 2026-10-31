// S06 · PR 523 — the blocklist proposal's settings card, the admin API (path after /api/admin/risk):
//   GET  /api/admin/risk/block-proposal  the setting as the Risk rules card shows it ({cards: {proposal}}) (risk.rules.read)
//   PUT  /api/admin/risk/block-proposal  {key: 'proposal', value, version} the switch, the number of rejections, the
//                                         counted cancel codes (risk.rules.write, audited); a screen read before someone
//                                         else's save is STALE
// The decisions themselves ("Block", "Not now") go through /api/admin/risk/blocklist/proposals/<id> (risk-api.ts).
// Nothing here blocks anyone, holds or cancels an order.
import { createHash } from 'node:crypto';
import { audit, requirePermission } from '@extas/auth';
import { riskBlockProposalSchema, storeTarget, type RiskBlockProposal } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { storeIdOf } from '../shipping-api';

export interface BlockProposalCard {
  key: 'proposal';
  value: RiskBlockProposal;
  version: string;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function blockProposalCard(deps: Pick<AdminDeps, 'resolver'>, storeId: number): Promise<BlockProposalCard> {
  const value = await deps.resolver.value('risk.blockProposal', { storeId });
  return { key: 'proposal', value, version: versionOf(value) };
}

/** /api/admin/risk/block-proposal (GET, PUT). */
export async function blockProposalSettingsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length !== 1) return fail(404, 'not-found');
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'risk.rules.read', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  if (method === 'GET') return json({ ok: true, cards: { proposal: await blockProposalCard(d, storeId) } });
  try {
    await requirePermission(d.db, g.actor, 'risk.rules.write', { storeId });
  } catch (e) {
    return errorResponse(e);
  }
  const input = await body(request);
  if (input.key !== 'proposal') return fail(400, 'INVALID_INPUT', ['key']);
  const before = await blockProposalCard(d, storeId);
  if (input.version !== before.version) return fail(409, 'STALE');
  // an emptied number box is "not set"
  const raw = isObj(input.value) ? { ...input.value, ...(input.value.minRejections === '' ? { minRejections: null } : {}) } : null;
  const ok = riskBlockProposalSchema.safeParse(raw);
  if (!ok.success) return fail(400, 'INVALID_INPUT', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (JSON.stringify(ok.data) !== JSON.stringify(before.value)) {
    await d.resolver.set('risk.blockProposal', ok.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Risk rules › Blocklist proposal' });
    await audit(d.db, g.actor, { storeId, action: 'risk.blockProposal.save', entityType: 'Setting', entityId: 'risk.blockProposal', before: { ...before.value }, after: { ...ok.data } }, g.ctx);
  }
  return json({ ok: true, cards: { proposal: await blockProposalCard(d, storeId) } });
}
